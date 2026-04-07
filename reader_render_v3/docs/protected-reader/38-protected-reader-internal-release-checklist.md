# 38. Protected Reader Internal Release Checklist

Run this checklist before any new internal protected-reader update:

1. `npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686`
2. `npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686`
3. `node reader_render_v3/tools/internal/check-protected-reader-readiness.js --url=http://127.0.0.1:8790/reader/?id=19686&reader=protected --headless=true --live-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape --expect-live-protected=true`
4. `node reader_render_v3/tools/internal/run-pilot-readiness.js --localhost-base=http://127.0.0.1:8790 --live-base=https://codex-reader-render-v3.reader-books.pages.dev`
5. `node reader_render_v3/tools/internal/check-old-reader-ux-parity.js '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=http://127.0.0.1:8790/reader/?id=19686'`
6. `node reader_render_v3/tools/internal/check-old-reader-ux-parity.js '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'`
7. `node reader_render_v3/tools/internal/check-old-reader-reading-parity.js '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=http://127.0.0.1:8790/reader/?id=19686'`
8. `node reader_render_v3/tools/internal/check-old-reader-reading-parity.js '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'`
9. `node reader_render_v3/tools/internal/check-old-reader-full-ux-parity.js '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=http://127.0.0.1:8790/reader/?id=19686'`
10. `node reader_render_v3/tools/internal/check-old-reader-full-ux-parity.js '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'`
11. `node reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=http://127.0.0.1:8790/reader/?id=19686'`
12. `node reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'`
13. `node reader_render_v3/tools/internal/check-old-shell-protected-ux-integration.js '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape'`
14. `node reader_render_v3/tools/internal/check-old-shell-protected-ux-integration.js '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'`
15. verify rollout matrix still passes:
   - old default
   - protected allowed
   - rollout off
   - denylist
   - worker unavailable
   - missing artifact
16. verify copy surface hardening still passes
17. verify sync file roundtrip still passes
18. if Drive is configured and authorized in the execution environment:
   - require a real Drive smoke
19. verify old reader default route still opens old reader
20. verify protected mode remains canvas-only and `/debug/` stays absent

Release gate result:

- all critical checks green -> internal update allowed
- any critical failure -> no-go
- Drive unauthorized in headless env -> warning only unless Drive is explicitly required for the release
- old-shell protected UX smoke is a required gate, not an optional manual check
- full UX conformance smoke is also a required gate:
  - real font and viewport reflow
  - two-column on wide screens
  - no horizontal page-turn jerk
  - visible underlay
  - custom context note flow
  - note list refresh
  - visible note-jump emphasis
  - whole-book counter
  - chapter-boundary continuation
  - TOC behavior and styling
  - bookmarks
  - touch swipe
