const fs = require('fs/promises');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosDate, dosTime };
}

function localFileHeader(entry, offset) {
  const nameBuffer = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  entry.offset = offset;
  return Buffer.concat([header, nameBuffer, entry.data]);
}

function centralDirectoryHeader(entry) {
  const nameBuffer = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

async function createMinimalEpub(filePath, options = {}) {
  const title = options.title || 'Playwright Test Book';
  const author = options.author || 'Playwright';
  const language = options.language || 'en';
  const identifier = options.identifier || `urn:uuid:${Date.now()}`;
  const chapterTitle = options.chapterTitle || 'Chapter 1';
  const chapterText = options.chapterText || 'This is a minimal EPUB used for end-to-end publishing checks.';
  const now = new Date();
  const { dosDate, dosTime } = toDosDateTime(now);

  const entries = [
    {
      name: 'mimetype',
      data: Buffer.from('application/epub+zip', 'utf8'),
      dosDate,
      dosTime,
    },
    {
      name: 'META-INF/container.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
        'utf8'
      ),
      dosDate,
      dosTime,
    },
    {
      name: 'OEBPS/content.opf',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:identifier id="BookId">${identifier}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chapter1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`,
        'utf8'
      ),
      dosDate,
      dosTime,
    },
    {
      name: 'OEBPS/toc.ncx',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${identifier}"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>${chapterTitle}</text></navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
        'utf8'
      ),
      dosDate,
      dosTime,
    },
    {
      name: 'OEBPS/chapter.xhtml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${chapterTitle}</title>
  </head>
  <body>
    <h1>${chapterTitle}</h1>
    <p>${chapterText}</p>
  </body>
</html>`,
        'utf8'
      ),
      dosDate,
      dosTime,
    },
  ].map((entry) => ({ ...entry, crc: crc32(entry.data), offset: 0 }));

  const localParts = [];
  let offset = 0;
  for (const entry of entries) {
    const part = localFileHeader(entry, offset);
    localParts.push(part);
    offset += part.length;
  }

  const centralDirectoryOffset = offset;
  const centralParts = entries.map((entry) => centralDirectoryHeader(entry));
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const zipBuffer = Buffer.concat([
    ...localParts,
    ...centralParts,
    endOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset),
  ]);

  await fs.writeFile(filePath, zipBuffer);
  return filePath;
}

module.exports = {
  createMinimalEpub,
};
