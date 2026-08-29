# DetailEngine Command Centre — Agent Instructions

These instructions apply to the entire repository and to every AI coding tool or automation working in it.

## Mandatory branch policy

- Make all code, configuration, documentation, and infrastructure-as-code edits on the `staging` branch by default.
- Treat both `main` and `production` as protected production branches.
- Never commit, merge, cherry-pick, push, update a ref, or trigger a deployment from `main` or `production` unless the user explicitly asks for a production release in the current conversation.
- Requests such as "fix", "change", "update", "deploy", or "ship" mean staging only unless the user explicitly says production.
- Do not automatically synchronize `staging` into `main` or `production`.
- A successful staging change is not permission to promote it.
- Before a requested production release, identify the exact staging commit being promoted and verify it on staging.
- After a requested production release, verify the production URL separately.

## Required workflow

1. Inspect and branch from the current `staging` state.
2. Make the requested change on `staging`.
3. Run the relevant lint, tests, and production build.
4. Verify the deployed change at the staging URL.
5. Report the staging commit and verification result.
6. Stop. Promote to production only when the user explicitly asks.

## Current environments

Status recorded on 2026-08-29:

| Environment | Git/Vercel target | Stable URL |
| --- | --- | --- |
| Staging | `staging` branch | https://detailengine-command-centre.vercel.app |
| Production | Vercel Production; protected `main`/`production` branches | https://dashboard.getdetailengine.com |

Both domains were shown as **Valid Configuration** in Vercel. The custom production domain is assigned to Production, and the stable `vercel.app` domain is assigned to the `staging` branch.

## Connected infrastructure

- GitHub repository: `detailenginecole/detailengine-command-centre`
- Vercel team: `DetailEngine` (`detail-engine1`)
- Vercel project: `detailengine-command-centre`
- Vercel project ID: `prj_4daOBfknXAfauxCNoKPOMLO8wXIb`
- Supabase project ref: `pcegpghnijnesltfbbaa`
- Supabase URL: `https://pcegpghnijnesltfbbaa.supabase.co`
- Google authentication is handled through Supabase OAuth.
- Google OAuth callback URI: `https://pcegpghnijnesltfbbaa.supabase.co/auth/v1/callback`

## Authentication URL requirements

Supabase Auth URL Configuration should use:

- Site URL: `https://dashboard.getdetailengine.com`
- Production redirect URL: `https://dashboard.getdetailengine.com/auth/callback`
- Staging redirect URL: `https://detailengine-command-centre.vercel.app/auth/callback`

The Google OAuth client should allow these JavaScript origins:

- `https://dashboard.getdetailengine.com`
- `https://detailengine-command-centre.vercel.app`

Keep the Google OAuth redirect URI pointed at the Supabase callback URI above.

## Security rules

- Never commit Google client secrets, Supabase secret/service-role keys, Vercel tokens, or other private credentials.
- Browser-safe Supabase publishable keys are not authorization by themselves; database access must remain protected by appropriate RLS policies.
- Do not weaken authentication or domain restrictions to make a deployment pass.
