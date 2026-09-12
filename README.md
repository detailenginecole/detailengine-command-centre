# DetailEngine Command Centre

The private operating dashboard for DetailEngine accounts, leads, outcomes,
media buying, client ROI, and daily action briefings.

This repository is the Vercel-ready version of the Command Centre. Supabase is
the source of truth and supplies the dashboard data through Edge Functions.

## What is included

- Company-wide overview and account list
- Per-account performance, ROI, leads, outcomes, and GHL history
- Account overview headline metrics: total leads, qualified leads, and warm transfers
- Meta campaign, ad set, and ad detail
- DetailEngine advice-only media intelligence
- Live account identity/lifecycle, sequential monthly cycles with per-cycle budgets and transfer goals, onboarding, Meta/GHL integration management, and feedback routing
- Supabase-backed internal account chat with attributed messages, replies, and reply notifications
- Date-range lead and ad reports
- Supabase Google authentication restricted to the DetailEngine email domain

## Branches and Vercel

- `production`: production deployments and the main public domain
- `staging`: stable staging deployments for testing
- `main`: bootstrap branch required by GitHub; it starts from the same release

When importing this repository into Vercel, set **Production Branch** to
`production`. Vercel will create Preview Deployments for `staging`; you can add
a staging domain to that branch in the Vercel project settings.

## Environment variables

Copy `.env.example` to `.env.local` for local work. Add the same five variables
to Vercel for Production, Preview, and Development as appropriate.

Never place the Supabase secret key or `service_role` key in a `NEXT_PUBLIC_`
variable. The browser only receives the Supabase publishable key.

The server-only `DETAILENGINE_SYNC_SECRET` must match the secret used by the
DetailEngine Supabase Edge Functions.

Account-management writes do not use this shared secret. They forward the
signed-in Supabase access token to the JWT-protected
`command-centre-admin` function, which derives the actor from the verified
DetailEngine user session.

## Supabase Auth setup

Google must be enabled under **Supabase → Authentication → Providers**. Add each
Vercel production and staging callback URL under **Authentication → URL
Configuration → Redirect URLs**:

```text
https://your-production-domain.com/auth/callback
https://your-staging-domain.com/auth/callback
http://localhost:3000/auth/callback
```

The app allows signed-in users only when their verified email ends with the
domain in `DETAILENGINE_ALLOWED_EMAIL_DOMAIN`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

For a local UI preview without Google sign-in, set
`DETAILENGINE_GOOGLE_AUTH_ENABLED=false` in `.env.local`.

## Verification

```bash
npm test
```

This runs ESLint and a full Next.js production build. GitHub Actions runs the
same check on `main`, `production`, and `staging`.


## Canonical client identity

Every client-specific request uses the permanent UUID from Supabase clients.id. This is the same value used by the other DetailEngine dashboard, client memberships, leads, invoices, reporting cycles and integration records. External provider IDs are scoped mappings under this UUID; business names and slugs are not new account identities. Never generate a separate dashboard client ID.

An omitted selection may choose the first accessible account. An explicit empty, malformed, unknown or inaccessible ID must not fall back to another account. UUID + conflicting slug is rejected. RLS/authentication still determines access; knowing a UUID never grants it. See the Master Drive platform client-identity-contract.md and DEC-025.

Generated account links, refreshes, report requests, account edits and ad-selection storage keys use the UUID. The historical /accounts/[slug] route still accepts a unique legacy slug at its entry boundary, then carries the resolved UUID through subsequent requests. Duplicate slug matches and conflicting identifiers are rejected. Returned data/report identities are checked before use.

Staging uses isolated command-centre-data-staging, command-centre-admin-staging and command-centre-report-staging functions, plus the existing command-centre-staging wrapper. The isolated data/report services require the existing internal sync secret; admin and wrapper requests require an authenticated user. Production uses the equivalent command-centre-data-production, command-centre-production, command-centre-admin and command-centre-report sources. The production copies differ from staging only in their backend endpoint names. Publish the production data function first, then report/admin/wrapper services, before promoting the frontend. Production release was explicitly approved on 2026-09-12; provider verification and release IDs are recorded in the Master Drive PROGRESS_LOG.md.

Identity tests exercise the real Edge handlers with synthetic provider responses: same UUID after renaming, unknown/conflicting/duplicate selections, client-scoped detail reads, UUID-only writes and wrong-account report responses. They perform no network writes.
