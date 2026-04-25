# 46. Old Reader Reading Behavior Parity Gaps

## Old reader baseline behavior

- reading is reflowed paginated text, not a fixed poster surface
- font-size controls rebuild pagination and visible line composition
- page turn uses stable adjacent-page underlay with shadowed transition feel
- next and prev continue through chapter boundaries
- footer counter is global across the whole book
- right-click selection opens reader selection actions, not the browser context menu
- opening a note from the notes list jumps to the target and visibly marks it

## Protected path behavior before this step

- font-size controls were either disabled or not driving real layout reflow
- page turn used a simple iframe shift and felt jumpy
- no adjacent-page underlay or swipe-shadow feel in protected old-shell mode
- custom note popup flow was incomplete; browser context menu could still win
- note jump navigated, but did not visibly emphasize the target range
- shell summary lost numeric global page fields
- chapter-boundary continuation was not covered by a dedicated browser-level parity probe

## Exact gaps treated as mandatory here

- real reflow after font-size changes
- stable page-turn preview / underlay feel
- browser context menu suppression on protected reading surface when selection is active
- visible note target emphasis after note jump
- book-wide global counter consistency
- explicit chapter-boundary next / prev verification

## Non-goals for this step

- reintroducing DOM text into the protected surface
- weakening worker-only protected rendering
- making Drive or OAuth part of the reading UX smoke

## Full-parity follow-up blockers

- viewport resize had to become a first-class pagination input, not an indirect side effect
- shell loader and footer counter had to be explicitly owned by protected old-shell mode
- note flow had to preserve selection through right click and hide the toolbar before showing the composer
