# 39. Protected Reader Internal Troubleshooting

## Protected route opens old reader instead

- Symptom: `?reader=protected` still shows the old shell.
- Likely cause: wrong environment, rollout fallback, or unpublished preview route.
- Tester should do: check the URL and runtime route target.
- Maintainer should check: published preview alias, rollout status, fallback reason, live route probe.

## Old-shell protected UX route does not embed the protected engine

- Symptom: old shell opens, but there is no embedded protected surface.
- Likely cause: missing `protectedUx=old-shell`, broken embedded route, or unpublished shell-host code.
- Tester should do: include the exact route and whether `#protectedOldShellFrame` exists.
- Maintainer should check: `reader/index.html`, `protected-old-shell-host.js`, preview deployment contents, and the old-shell UX runner.

## Protected unavailable message

- Symptom: protected page opens but shows unavailable.
- Likely cause: worker unavailable or force-disabled.
- Tester should do: capture the runtime meta block.
- Maintainer should check: `Worker available`, `Rollout decision`, worker creation path.

## Missing artifact

- Symptom: protected request returns to old reader with fallback reason.
- Likely cause: no protected artifact for that book.
- Tester should do: confirm the book id.
- Maintainer should check: artifact manifest path and protected build output.

## Rollout disabled or denylist triggered

- Symptom: old reader opens with `protectedFallbackReason=...`.
- Likely cause: rollout override or denylist.
- Tester should do: include the exact URL used.
- Maintainer should check: rollout config and query overrides.

## Fingerprint mismatch on import

- Symptom: import warns or is rejected.
- Likely cause: sync file from another artifact/book version.
- Tester should do: attach the sync file metadata and compatibility status.
- Maintainer should check: book fingerprint, schema version, import compatibility report.

## Sync file import failed

- Symptom: protected sync file does not restore state.
- Likely cause: malformed file or incompatible payload.
- Tester should do: include the export/import JSON headers and status text.
- Maintainer should check: sync bundle parser and compatibility assessment.

## Drive unavailable or unauthorized

- Symptom: Drive status stays unavailable/unauthorized.
- Likely cause: no configured client id, no auth session, or tester not authorized.
- Tester should do: report `Drive configured`, `Drive authorized`, `Drive warning`.
- Maintainer should check: published meta config, auth state, and transport UI behavior.

## Drive should not block UX smoke

- Symptom: shell-integration smoke gets stuck on Drive UI.
- Likely cause: wrong route or missing automation-safe flags.
- Tester should do: use the old-shell automation route with `protectedDrive=disabled&protectedAutomation=1`.
- Maintainer should check: embedded route params, drive-disabled state, and the UX runner.

## Route 404

- Symptom: preview protected URL is missing.
- Likely cause: deploy bundle not published or wrong preview alias.
- Tester should do: include the exact URL.
- Maintainer should check: Pages deploy branch alias and published bundle contents.

## Readiness runner failed

- Symptom: unified runner returns `ok: false`.
- Likely cause: regression in lifecycle, persistence, sync, rollout, or live route.
- Tester should do: attach the JSON output.
- Maintainer should check: failing section, regressions list, and last code changes.
