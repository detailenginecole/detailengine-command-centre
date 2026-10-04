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

Copy `.env.example` to `.env.local` for local work. Add the same six variables
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


## Sales-call client start

The internal `/start` route is a plain staff-only client and payment form. It
collects the business and authorized-signer details needed for payment and the
service agreement, then calls the authenticated `client-setup-payment` Edge
Function. The setup fee
defaults to $1,000 USD. The retainer defaults to $2,500 USD. Clicking either
amount card opens a focused editor for that amount; each accepts whole-dollar
values from $1 through $100,000 before Checkout is created. The commercial
summary shows the setup fee first under **Paid Today**, followed by the
contract-based description that it covers initial preparation and setup before
work begins. The recurring amount is labeled **Management Fee** under the
28-day-plus-full-target heading, followed by its completion, extension and
cancellation description. Staff can see `USD` beside both amount summaries
throughout the Start flow. They can
either open Checkout inside the page with Stripe.js or create a client-specific
Stripe-hosted payment link to copy, email or open. In both paths, card data is
entered inside Stripe's UI and never reaches DetailEngine's application servers.

After a verified payment, the existing webhook reserves and uses the canonical
`clients.id`, creates the onboarding records and provider placeholders, assigns
the buyer as the initial Client Portal owner, and sends the setup invitation.
Repeated submissions for the same business, email, amount and compatible
display mode reuse an open checkout. Changing the fee or switching between
embedded and hosted Checkout expires the incompatible open session before
creating the replacement. The signed webhook compares the paid total to the
server-side setup intent before it provisions the client. The browser requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; this must
be the live publishable key for the same Stripe account as the server secret.

The route is protected by the same verified `@getdetailengine.com` server-side
identity boundary as the Command Centre, and the payment Edge Function checks
that identity again. `start.getdetailengine.com` should be assigned to this
Vercel project; its root renders the sales-start experience while
`dashboard.getdetailengine.com` continues to render the Command Centre.

## Contract onboarding

The start form captures the client legal business name, entity type and jurisdiction, signer name and email, USD setup fee, USD retainer, blank required transfer-opportunity goal and daily advertising budget. It does not collect the signer title, address or telephone during the sales call. The signer supplies their title at the final Agreement step. The setup and retainer cards each open their own editor; there is no global Settings control. The server validates the full purchase snapshot before requesting Stripe Checkout.

The start API returns 503 unless `DETAILENGINE_CONTRACT_CAPTURE_ENABLED=true`, preventing a deployment that cannot preserve the agreed terms from accepting payment. `/start-preview` supports no-charge review of the fields and interaction.

The shared Client Portal source contains the final Agreement step, signer-authorized link lookup, completion gate migration, immutable purchase/contract snapshots and private archive download support. The modified payment function seeds a preparing contract record after verified payment and uses the agreed retainer for the operating profile. Existing purchases without contract terms retain their legacy path.


Promote Start workflow changes only after focused interaction checks, the full repository validation, a READY staging deployment and explicit production approval. Production payment and signing verification evidence belongs in the Master Drive `PROGRESS_LOG.md`.


## Native signing release — 2026-10-02 UTC

Verified production: PR #15 merged the contract capture changes into production commit 39d668e88503551a0670eae9cfed0fd12306c80e. Vercel dpl_5S5GEp6zDEMGEo2eyiJyyXkaCJCM is READY on start.getdetailengine.com and dashboard.getdetailengine.com. Production and staging DETAILENGINE_CONTRACT_CAPTURE_ENABLED are true.

The production Start form now asks for the legal business name, entity type and formation jurisdiction first, followed by signer name/email and the two commercial inputs. Business address and telephone are collected later during onboarding where they are operationally required. The client enters their title at the final agreement-signing step, so staff do not duplicate it during payment setup. Formation jurisdiction seeds the initial account location until onboarding supplies the business address. Production commit `5af5eadadfc0b3b9573f224a081371e819f506f0` and deployment `dpl_CEMTDnWxocVu5bpg5x97kS78Vc5i` released this flow on 2026-10-02 UTC.

This supersedes the historical not-activated/GHL dependencies above. Native Portal signing replaces GHL document generation. Supabase native signing migration is applied, client-contract v1 and client-setup-payment v11 are ACTIVE, and the portal Agreement UI is deployed. The final step autofills the immutable terms, includes Cole's privately stored authorized signature, obtains explicit client consent/signature and preserves the signed PDF/audit before finishing setup. Retainer collection stays manual.

The approved non-binding live fixture used fake signatures only. Signing/completion, account isolation, replay, private download and matching Drive archive passed; all fixture records/files were removed. No real card or customer invitation was used. The Windows archive task runs every ten minutes while Cole's session and Google Drive are running; Supabase retains the durable original if Drive is offline. Cloud archiving is not configured. Full release details and verification limits: Master Drive / 00 — DetailEngine Platform / client-portal / docs / native-contract-release.md.


## v1 brand rollout — 2026-10-04

The shared Drive DetailEngine — v1 Brand Kit is the visual source of truth. Layouts self-host Barlow through next/font/local; public/brand contains outlined logo assets, and app/brand-v1.css establishes the shared red/graphite/silver theme, 6px controls and 12px cards. Existing data/auth/payment behavior is preserved. Release verification and email publication status are recorded in the shared PROGRESS_LOG.md.
