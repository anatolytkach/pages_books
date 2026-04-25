# Local DOCX To Protected Reader

## Purpose

Run a local file through the same protected-content build stages without using staging:

- validate `.docx`
- convert `docx -> epub`
- convert `epub -> protected artifact`
- open the result in the local protected reader

This is useful for fast debugging of conversion/layout issues before running a full staging upload.

## Tested Environment

- Repo worktree:
  - `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim`
- Example input:
  - `C:\Users\yaran\Documents\vopros12.docx`

## Prerequisites

Install these once on Windows:

- Python 3 available as `py -3`
- `python-docx`
- Pandoc
- Node.js

Install commands:

```powershell
py -3 -m pip install --user python-docx
winget install --id JohnMacFarlane.Pandoc --exact --accept-package-agreements --accept-source-agreements
```

If `pandoc` is not on `PATH` in the current PowerShell session, prepend it manually:

```powershell
$env:PATH = 'C:\Users\yaran\AppData\Local\Pandoc;' + $env:PATH
```

## Manual Flow

### 1. Open the worktree

```powershell
cd C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim
```

### 2. Validate the DOCX

```powershell
py -3 .\tools\publish\validate_docx.py "C:\Users\yaran\Documents\vopros12.docx"
```

Expected result:

- `DOCX validation passed.`

If validation fails, stop and fix the document first.

### 3. Build EPUB from DOCX

```powershell
New-Item -ItemType Directory -Force -Path .\.tmp_local | Out-Null

py -3 .\tools\publish\build_epub_from_docx.py `
  --input "C:\Users\yaran\Documents\vopros12.docx" `
  --output ".\.tmp_local\vopros12.epub" `
  --title "vopros12" `
  --author "Unknown" `
  --language "ru"
```

Resulting EPUB:

- `.tmp_local\vopros12.epub`

### 4. Build the protected artifact from the EPUB

Run from inside `reader_render_v3`:

```powershell
cd .\reader_render_v3

node .\tools\protected-ingestion\build-protected-book.js `
  --input "C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim\.tmp_local\vopros12.epub" `
  --output ".\artifacts\protected-books\29686" `
  --book-id 29686 `
  --debug-artifact `
  --allow-partial-toc
```

Why `--allow-partial-toc`:

- Pandoc may generate a TOC item that does not map cleanly back to chunk anchors.
- Without this flag, the protected build can fail on a TOC mismatch.

Then return to the repo root:

```powershell
cd ..
```

### 5. Start a local HTTP server

From repo root:

```powershell
C:\Users\yaran\AppData\Local\Programs\Python\Python312\python.exe -m http.server 8788 --bind 127.0.0.1
```

Leave that terminal open while reading locally.

### 6. Open the local protected reader

Dev protected reader:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?artifact=../artifacts/protected-books/29686&renderMode=shape&metricsMode=shape
```

Old-shell protected reader:

```text
http://127.0.0.1:8788/reader/?id=29686&reader=protected&protectedUx=old-shell&protectedAllowAll=1&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape
```

Use the old-shell URL if you want the closest match to the current protected reading UX.

## Output Locations

EPUB:

- `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim\.tmp_local\vopros12.epub`

Protected artifact root:

- `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim\reader_render_v3\artifacts\protected-books\29686`

Important runtime files:

- `manifest.json`
- `chunks\`
- `glyphs\`
- `shapes\`

## Stop The Local Server

If the server is running in the foreground, press `Ctrl+C`.

Or stop it from another PowerShell window:

```powershell
Get-NetTCPConnection -LocalPort 8788 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID>
```

## One-Session Shortcut

After prerequisites are installed, the full run is:
$env:PATH = 'C:\Users\yaran\AppData\Local\Pandoc;' + $env:PATH
New-Item -ItemType Directory -Force -Path .\.tmp_local | Out-Null

py -3 .\tools\publish\validate_docx.py "C:\Users\yaran\Documents\vopros12.docx"

py -3 .\tools\publish\build_epub_from_docx.py `
  --input "C:\Users\yaran\Documents\vopros12.docx" `
  --output ".\.tmp_local\vopros12.epub" `
  --title "vopros12" `
  --author "Unknown" `
  --language "ru"

cd .\reader_render_v3
node .\tools\protected-ingestion\build-protected-book.js `
  --input "C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim\.tmp_local\vopros12.epub" `
  --output ".\artifacts\protected-books\29686" `
  --book-id 29686 `
  --debug-artifact `
  --allow-partial-toc
cd ..

C:\Users\yaran\AppData\Local\Programs\Python\Python312\python.exe -m http.server 8788 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8788/reader/?id=29686&reader=protected&protectedUx=old-shell&protectedAllowAll=1&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape
```

## Notes

- Do not place the generated EPUB under the protected artifact output directory.
  The protected builder clears its output root before writing, so that would delete the EPUB before or during the build.
- The localhost old-shell protected route expects a numeric book id.
- The dev protected reader can also be opened directly with `artifact=../artifacts/protected-books/29686`.
