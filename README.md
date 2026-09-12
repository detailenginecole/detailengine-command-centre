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

The internal dashboard permits only `@getdetailengine.com` users. Keep `DETAILENGINE_ALLOWED_EMAIL_DOMAIN=getdetailengine.com` and authentication enabled in deployed environments. Client Portal membership, ownership, invitations and external email/password accounts never grant internal-dashboard access. The app and user-facing Edge Functions validate the Auth user’s email independently of profile metadata. Google OAuth also restricts sign-in to the organization.

Verified 2026-09-12: the authorized external Gmail test identity received Google `403 org_internal`; deployed production/admin/report function sources match the reviewed repository. Thirteen tests pass, including external/lookalike/subdomain identities denied before business reads or writes and frontend denial despite forged profile metadata. No runtime restriction change was required.

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

Staging uses isolated command-centre-data-staging, command-centre-admin-staging and command-centre-report-staging functions, plus the existing command-centre-staging wrapper. The isolated data services require the existing internal sync secret; admin and wrapper requests require an authenticated user. Report requests forward the signed-in session and the report service verifies the confirmed internal user before loading data with its server-side sync secret. Reports also accept the existing internal sync secret for trusted service requests. No sync secret is required in the browser or Vercel report route. Production uses the equivalent command-centre-data-production, command-centre-production, command-centre-admin and command-centre-report sources. The production copies differ from staging only in their backend endpoint names. Publish the production data function first, then report/admin/wrapper services, before promoting the frontend. Production release was explicitly approved on 2026-09-12; provider verification and release IDs are recorded in the Master Drive PROGRESS_LOG.md.

Identity tests exercise the real Edge handlers with synthetic provider responses: same UUID after renaming, unknown/conflicting/duplicate selections, client-scoped detail reads, UUID-only writes and wrong-account report responses. They perform no network writes.

Read-only database calls in the data/wrapper functions retry a 502/503/504 response once after 250 ms, preserving the exact request and client UUID. Other failures and account mutations are not retried. This addresses intermittent upstream timeouts observed during production verification.
