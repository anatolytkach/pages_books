# Windows Environment Setup

Use this when running Codex, Playwright, backend checks, or deploy commands from native Windows instead of WSL.

## Known Values

These values were confirmed in the current repo/session:

```bat
set SUPERUSER_EMAIL=yarane@gmail.com
set SUPERUSER_PASSWORD=Sophi@35

set SUPABASE_URL=https://kalbegycglkhxulhatpx.supabase.co
set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthbGJlZ3ljZ2xraHh1bGhhdHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzkyODIsImV4cCI6MjA4OTM1NTI4Mn0.T1VqDg2ZK87RfnABKMHUwDLpT7bVOckr40Pv-aIppKs

set CLOUDFLARE_ACCOUNT_ID=764a8c94ce002764fc1d3d29faa4bb09
```

## Missing Secrets

These were not present in the repo and were not available in the current shell environment:

```bat
set SUPABASE_SERVICE_ROLE_KEY=PASTE_REAL_SERVICE_ROLE_KEY_HERE
set CLOUDFLARE_API_TOKEN=PASTE_REAL_CLOUDFLARE_API_TOKEN_HERE
```

## Where To Get The Missing Values

### `SUPABASE_SERVICE_ROLE_KEY`

Get it from the Supabase project:

1. Open Supabase dashboard
2. Select project: `kalbegycglkhxulhatpx`
3. Go to `Settings -> API`
4. Copy the `service_role` key

This is a secret. Do not commit it into the repo.

### `CLOUDFLARE_API_TOKEN`

Use one of these:

1. Existing Wrangler auth on Windows:

```bat
npx.cmd wrangler whoami
```

If this succeeds, you may already have enough Cloudflare auth locally without manually setting the token.

2. Cloudflare dashboard token:

- Open Cloudflare dashboard
- Go to `My Profile -> API Tokens`
- Use an existing token that can deploy Pages for this account, or create one with the required Pages permissions

This is also a secret. Do not commit it into the repo.

## Minimal Sets By Task

### Playwright Only

```bat
set SUPERUSER_EMAIL=yarane@gmail.com
set SUPERUSER_PASSWORD=Sophi@35
```

### Backend / Worker Checks

```bat
set SUPABASE_URL=https://kalbegycglkhxulhatpx.supabase.co
set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthbGJlZ3ljZ2xraHh1bGhhdHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzkyODIsImV4cCI6MjA4OTM1NTI4Mn0.T1VqDg2ZK87RfnABKMHUwDLpT7bVOckr40Pv-aIppKs
set SUPABASE_SERVICE_ROLE_KEY=PASTE_REAL_SERVICE_ROLE_KEY_HERE
```

### Staging Deploys

```bat
set CLOUDFLARE_ACCOUNT_ID=764a8c94ce002764fc1d3d29faa4bb09
set CLOUDFLARE_API_TOKEN=PASTE_REAL_CLOUDFLARE_API_TOKEN_HERE
```

## Quick Verification

```bat
echo %SUPERUSER_EMAIL%
echo %SUPABASE_URL%
echo %CLOUDFLARE_ACCOUNT_ID%
npx.cmd wrangler whoami
```
