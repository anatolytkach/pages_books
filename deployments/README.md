# Deployment Ledger

This directory stores a permanent repo-side record of deployments.

Format:
- append one JSON object per line to `history.jsonl`
- each record captures the source git branch and commit, the target environment, the Pages project and branch, and the canonical URL

Required fields:
- `deployedAt`
- `environment`
- `project`
- `pagesBranch`
- `sourceBranch`
- `commit`
- `url`

Optional fields:
- `deploymentId`
- `deploymentUrl`
- `actor`
- `notes`
