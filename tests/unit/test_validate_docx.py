from __future__ import annotations

import os
import tempfile
import unittest
import zipfile

from tools.publish.validate_docx import validate_docx


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="wmf" ContentType="image/x-wmf"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

DOC_RELS_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{image_name}"/>
</Relationships>
"""

STYLES_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
  </w:style>
  {extra_style}
</w:styles>
"""

DOCUMENT_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    {paragraphs}
    {drawing}
  </w:body>
</w:document>
"""


def make_docx(path: str, *, extra_style: str = "", paragraphs: str = "", drawing: str = "", image_name: str = "image1.png") -> None:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", RELS)
        archive.writestr("word/styles.xml", STYLES_TEMPLATE.format(extra_style=extra_style))
        archive.writestr("word/document.xml", DOCUMENT_TEMPLATE.format(paragraphs=paragraphs, drawing=drawing))
        archive.writestr("word/_rels/document.xml.rels", DOC_RELS_TEMPLATE.format(image_name=image_name))
        archive.writestr(f"word/media/{image_name}", b"binary-image")


class ValidateDocxTests(unittest.TestCase):
    def test_accepts_standard_heading_and_inline_raster_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "valid.docx")
            make_docx(
                path,
                paragraphs="""
                <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
                """,
                drawing="""
                <w:p><w:r><w:drawing><wp:inline>
                  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic>
                  </a:graphicData></a:graphic>
                </wp:inline></w:drawing></w:r></w:p>
                """,
            )
            self.assertEqual(validate_docx(path), [])

    def test_rejects_custom_heading_style(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "custom-heading.docx")
            make_docx(
                path,
                extra_style="""
                <w:style w:type="paragraph" w:styleId="FancyHeading" w:customStyle="1">
                  <w:name w:val="Fancy Heading"/>
                  <w:basedOn w:val="Heading1"/>
                </w:style>
                """,
                paragraphs="""
                <w:p><w:pPr><w:pStyle w:val="FancyHeading"/></w:pPr><w:r><w:t>Bad Heading</w:t></w:r></w:p>
                """,
            )
            errors = validate_docx(path)
            self.assertTrue(any(item.rule == "standard_headings_only" for item in errors))

    def test_rejects_floating_or_vector_like_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "floating.docx")
            make_docx(
                path,
                drawing="""
                <w:p><w:r><w:drawing><wp:anchor behindDoc="1">
                  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic>
                  </a:graphicData></a:graphic>
                </wp:anchor></w:drawing></w:r></w:p>
                """,
                image_name="image1.wmf",
            )
            errors = validate_docx(path)
            self.assertTrue(any(item.rule == "inline_images_only" for item in errors))
            self.assertTrue(any(item.rule == "raster_images_only" for item in errors))


if __name__ == "__main__":
    unittest.main()
