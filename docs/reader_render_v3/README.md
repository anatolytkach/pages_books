# Reader Render V3

This folder documents the isolated v3 protection project.

Goals:
- replace direct HTML chapter delivery with render-oriented payloads;
- keep one public reader path in the future;
- preserve TOC, notes, bookmarks, selection, and copy for legitimate users;
- keep legacy and current readers untouched until the v3 path is proven locally.

Current scope:
- define the v3 storage contract;
- define converter responsibilities;
- define runtime responsibilities for a canvas/text-model reader.

This folder is intentionally separate from the existing `docs` files so the v3
work can evolve without rewriting the current project documentation.
