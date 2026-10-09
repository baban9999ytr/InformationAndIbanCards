# Bilgi dashboard

Turkish NFC and digital business-card management app built with React, Vite, Tailwind CSS, and Supabase. It is a standalone static-site app in this repository; it does not change the existing OpenStackTools Worker.

## Run locally

```sh
npm install
cp .env.example .env
npm run dev
```

Set these Vite variables in `.env` (or `.env.local`):

- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable/anon key. Never put a service-role key in a `VITE_` variable.
- `VITE_APP_ORIGIN`: dashboard origin, normally `https://bilgi.openstacktool.com`.
- `VITE_MAIN_SITE_URL`: main site origin, normally `https://openstacktool.com`.
- `VITE_WORKER_URL`: HTTPS origin for the Cloudflare API Worker, normally `https://api.openstacktool.com`. The app calls `/api/check-url` and `/api/user/delete` on this origin.
- `VITE_URL_SCAN_ENDPOINT`: optional full URL override for the scan endpoint. When omitted, the app uses `${VITE_WORKER_URL}/api/check-url`.

Set real Supabase values locally; the checked-in example and initial local `.env` leave the credentials blank intentionally. Configure `CORS_ALLOWED_ORIGINS` as a Supabase Edge Function secret with the same comma-separated two origins before deploying the `resolve-card` and `submit-feedback` functions.

Build and locally preview the production bundle with `npm run build` and `npm run preview`.

## Supabase setup

1. For a new project, apply `supabase/schema.sql`. For an existing installation, apply the ordered SQL files under `supabase/migrations/`, including `20261008193000_auth_onboarding.sql`, `20261008210000_protect_profile_roles.sql`, `20261009120000_card_approval_and_super_users.sql`, and `20261009123000_modular_cards_feedback_privacy.sql`. The latest migrations add the protected `profiles.is_super_user` flag, a five-state card moderation workflow, modular JSONB card blocks with legacy-field backfill, and admin audit logging. Standard-user inserts and updates are forced into `pending_approval`; only admins/super users may publish or moderate cards. The database resolver serves active, owned cards only.
2. In Supabase Auth, enable email/password and **Confirm email** (double opt-in). Set the Site URL and redirect URL allow-list to include `https://bilgi.openstacktool.com/dashboard` (and the local dashboard URL used during development). Email sign-up sends its activation redirect there, and unconfirmed email sessions are denied access to protected routes.
3. To enable Google sign-in, configure the Google OAuth client in Google Cloud, enable the Google provider in Supabase Auth with that client ID/secret, and allow the Supabase Auth callback URL in Google. The profile trigger creates a `profiles` record for first-time OAuth users and syncs their display name.
4. Configure an SMS provider and enable phone sign-in only if existing users need phone OTP login. OTP login intentionally does not create an account.
5. Deploy `resolve-card`, `submit-feedback`, and the admin-only `admin-users` function from this folder with the Supabase CLI after applying the schema migration. `admin-users` validates the caller's access token and admin/super-user role on the server; it is the only path in the client UI that can ban/unban Auth users.
6. Set `SUPABASE_SERVICE_ROLE_KEY` only as a Supabase Edge Function secret. The `resolve-card` endpoint returns only card fields needed by the public page. Private cards use their 256-bit random capability token. Treat private-card URLs as bearer secrets. `submit-feedback` accepts 1–3 star ratings only for active Google-review cards and writes them to `card_feedbacks` without publishing them. Dashboard feedback is read through `get_card_feedback`, which masks visitor-selected identity fields for card owners while restricting unmasked access to admins/super users. Account deletion cascades through owned cards, NFC tags, feedback, and consent data.

### Roles and managed clients

New profiles receive the `user` role from a database trigger. The dashboard never accepts a role from registration metadata, and users cannot update their own role. Promote trusted staff explicitly from the Supabase SQL editor using a service-role/admin session, for example:

```sql
update public.profiles
set role = 'admin'
where email = 'trusted-operator@example.com';
```

Use `reseller` for delegated operators with the same dashboard permissions. Protect staff accounts with MFA and grant elevated roles only to trusted operators. Admin/reseller cards marked as managed can be assigned to an existing user profile or kept centrally under the operator's profile; assigned managed cards remain visible to operators only. Standard users can only manage their own non-managed cards. RLS enforces those boundaries independently of the dashboard UI. Internal `client_notes` are only available to operators through RLS-protected card access.

Operators can freeze or reactivate managed cards, review abuse reports, and move a report through pending, investigating, and resolved states. The public resolver returns only presentation fields and `is_active`; inactive cards show a localized notice and the feedback endpoint rejects writes to frozen cards.

## URL scanning Worker

Deploy `cloudflare/url-scan-worker.js` as a Cloudflare Worker and route `/api/*` for the dashboard hostname to it. It provides both `POST /api/check-url` and `DELETE /api/user/delete`. Configure:

- `APP_ORIGINS` as a comma-separated Worker variable containing `https://bilgi.openstacktool.com,https://openstacktool.com`. For compatibility, `APP_ORIGIN` is accepted as a single-origin fallback.
- `VIRUSTOTAL_API_KEY` as a Worker secret (never expose it to Vite or commit it).
- Optional fallback secrets `GOOGLE_SAFE_BROWSING_API_KEY` and `PHISHTANK_API_KEY`. VirusTotal is checked first; configured fallback providers are tried after service errors, timeouts, or incomplete scans. Selected trusted domains bypass external scanning.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker variables.
- `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret (never expose it to Vite or commit it).

The scan endpoint requires the current user's Supabase access token and validates admin/super-user scan-bypass permissions against `profiles` on the server. VirusTotal is attempted first, followed by configured Google Safe Browsing and PhishTank fallbacks when a provider fails, times out, or returns an incomplete result. Confirmed unsafe URLs are rejected. If every provider is unavailable, saving is non-blocking and standard-user cards remain in `pending_approval` until authorized approval. The deletion endpoint continues to validate the current Supabase access token before deleting the account. Submitted URLs may be shared with configured scanning providers and retained under their service terms; do not submit confidential or access-token URLs.

Administrators and super users can manage custom trusted domains from the dashboard's **Trusted domains** section. Each entry and its subdomains bypass external scanning, so only add domains the organization explicitly trusts. The `url_scan_allowlist` table and its role-restricted policies are created by `20261009123000_modular_cards_feedback_privacy.sql`; apply the database migration before deploying this Worker or enabling the management screen.

## Modular cards and moderation

The card editor stores the selected block layout in `nfc_cards.blocks`, while continuing to write the existing columns consumed by older card links and clients. Existing records are backfilled by the modular-card migration. Owners can reorder and hide supported profile, payment, review, contact, social, and custom-link blocks; administrators can approve, reject, suspend, restore, or archive a card. Rejection reasons and status transitions are recorded in `admin_audit_log`. The app writes local drafts to `card_builder_draft` and still reads the earlier `card_form_draft` key for recovery.

## Deploy the dashboard

Build this app from the `dashboard` directory with `npm run build`; the output directory is `dashboard/dist`. Set the `VITE_...` variables as build-time environment variables using real Supabase project values. The React app serves a public landing page at `/`, public card links at `/c/:slug`, and auth-protected dashboard screens at `/dashboard`, `/create`, and `/settings`. Email users must verify their address before accessing protected pages; after verification, the dashboard shows a one-step onboarding prompt until they choose an account type or skip it. The build emits `404.html` as a copy of the SPA entry point for static hosts that use a 404 document, and `public/_redirects` provides the Cloudflare Pages SPA rewrite. For Cloudflare Workers Assets, use `dashboard/wrangler.toml`, which configures `dist` and `single-page-application` not-found handling; `public/_routes.json` excludes `/assets/*` from Worker-first routing. Deploy the dashboard assets to `bilgi.openstacktool.com`. Deploy the API Worker on `api.openstacktool.com`, route `/api/*` to it, and configure its allowed origins as above. The main-site CTAs in the repository root link to the dashboard and card-creation routes. The repository-root `404.html` maps legacy legal aliases to `bilgi.openstacktool.com` and `/c/:slug` links to the legacy viewer; unmatched paths show a not-found page rather than becoming card lookups.

### Legal information routes

The main-site and public-card footers link to bilingual public routes on `bilgi.openstacktool.com` (`/tr/...` and `/en/...`). The dashboard serves these route aliases without authentication and maps them to the static `public/legal.html` page. The English and Turkish drafts cover terms, privacy, KVKK/GDPR, cookies/browser storage, and contact. They are explicitly **not approved for production**: complete and verify controller identity, provider configuration, retention periods, hosting regions, transfer safeguards, and effective dates, and obtain qualified legal review before publication.

## Data and safety notes

- Email registration requires one unchecked-by-default legal/age confirmation. The optional marketing preference is unchecked by default and stored in `profiles.marketing_opt_in`. Consent is saved in `auth.users` metadata; a database trigger rejects email registrations without the required legal/age metadata and records its timestamp in `consent_records`.
- Google OAuth profile creation, marketing preference synchronization, and onboarding completion/account type synchronization are handled by the `auth.users` database trigger. Onboarding account types are stored as `personal_freelancer` or `business_enterprise`; skipping stores completion without assigning an account type.
- Dashboard queries rely on Supabase RLS; the included schema restricts management and feedback reads to the card owner.
- Public and capability links are rendered as explicit external links with `noopener noreferrer`; the app never automatically redirects a visitor to a third-party site.
- Ratings of 1–3 stars can be sent to the business as private feedback, with a neutral Google Maps review link also available. Ratings of 4–5 can proceed to Google only after the visitor explicitly chooses the link. All external destinations are shown for confirmation before opening.
- This implementation supplies technical consent and data-rights UX, not legal advice. Have the final legal copy, retention, data residency, cookie use, SMS setup, and external processor disclosures reviewed for your actual service.
