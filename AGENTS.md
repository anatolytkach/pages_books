# Repository Working Guide

Start here for any new Codex task in this repository.

Always read these root files first:
- `PROJECT_CONTEXT.md`
- `PROJECT_RULES.md`
- `CURRENT_STATE.md`
- `COMPONENT_GUIDE.md`

Working rules:
- Keep the read scope narrow. After the root files, read only the component sections relevant to the task.
- Keep the change scope narrow. Do not refactor adjacent code unless the task requires it.
- Treat code, config, and the current repository state as the source of truth. If a state file is stale, update the file rather than following stale text.
- Do not invent facts. Record only what is supported by code, config, docs, or the repository state.
- After significant changes, update the relevant root state/context files. Do not update them for trivial edits.
- Prefer file-based context over chat history. New Codex branches should be able to start from these files.
