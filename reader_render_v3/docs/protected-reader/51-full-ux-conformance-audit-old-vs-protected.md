# 51. Full UX Conformance Audit: Old Reader vs Protected Old-Shell

## Critical user-visible behaviors in old reader

- Page turn is visually stable.
  The active page does not shift horizontally during next/prev, and adjacent-page underlay is visible during the turn.
- Wide desktop layout uses a spread-like two-column reading mode.
- Font-size and viewport changes trigger real reflow.
  Line composition, visible line heights, and page boundaries change.
- Progress is whole-book.
  The visible counter does not reset per chapter.
- Next/prev continue through chapter boundaries.
- TOC is interactive and styled like reader content.
  It is link-like, not button-like, and active-state styling respects dark theme.
- Notes and bookmarks are shell-native objects.
  Creating them updates the list immediately; clicking them jumps and visibly emphasizes the target.
- Touch swipe works on touch devices.
- Loader clears when the protected page is ready and after navigation/jump actions complete.

## Comparative gaps found before this pass

- Protected host animated the iframe with `translateX(...)`, which caused horizontal jerk during page turn.
- Underlay existed structurally but was too weak visually.
- Protected layout had gained re-pagination, but old-shell conformance still lacked a provable wide-screen two-column baseline and full-viewport comparative checks.
- TOC jump only mapped `tocId -> chunkIndex`, so entries targeting the same chunk often appeared to do nothing.
- TOC items were rendered as default buttons in the host, which created boxed/rectangular items.
- Dark-theme TOC styling inherited light-ish emphasis.
- Bookmark controls were wired in the shell but jump verification was not robust enough and chapter label context could degrade to `none`.
- Old shell loader was correct for ready/open, but conformance tooling still needed explicit post-restore validation.
- Legacy smoke tools were still partially hardcoded to `1 / 2 -> 2 / 2`.

## Critical gaps that had to be fixed now

- horizontal page-turn stability
- visible underlay during turn
- wide two-column behavior
- TOC click navigation
- TOC light/dark styling
- note list refresh
- note jump visible emphasis
- bookmark create/list/jump/persistence
- whole-book counter and chapter label context
- chapter-boundary continuation
- touch swipe
- loader lifecycle after restore/jump actions

## Secondary differences that remain acceptable

- Protected reading surface is still canvas-only and worker-backed instead of EPUB iframe DOM text.
- Drive remains disabled in automation-safe old-shell UX routes to keep conformance checks non-blocking and unattended.
