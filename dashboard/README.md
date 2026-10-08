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

1. For a new project, apply `supabase/schema.sql`. For an existing installation, apply the ordered SQL files under `supabase/migrations/`. The schema creates `profiles`, `nfc_cards`, `nfc_tags`, `card_feedbacks`, and consent tables, plus cascade deletion and required-consent enforcement for email registration.
2. In Supabase Auth, enable email/password and email confirmation. Configure an SMS provider and enable phone sign-in for OTP login. OTP login intentionally does not create a new account. Both the email registration and phone OTP forms require the legal checkboxes before proceeding; accepted phone-login consent is saved after OTP verification.
3. Deploy `resolve-card` and `submit-feedback` from this folder with the Supabase CLI.
4. Set `SUPABASE_SERVICE_ROLE_KEY` only as a Supabase Edge Function secret. The `resolve-card` endpoint returns only card fields needed by the public page. Private cards use their 256-bit random capability token. Treat private-card URLs as bearer secrets. `submit-feedback` accepts 1–3 star ratings only for active Google-review cards and writes them to `card_feedbacks` without publishing them. Account deletion cascades through cards, NFC tags, feedback, and consent data.

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
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker variables.
- `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret (never expose it to Vite or commit it).

The scan endpoint accepts `POST /api/check-url {"url":"https://..."}` and returns `{"safe":true}` only after VirusTotal reports a completed scan with no malicious or suspicious detections. Pending, incomplete, unavailable, and flagged scans are blocked. The deletion endpoint accepts `DELETE /api/user/delete` with the current Supabase access token in `Authorization: Bearer <token>`; the Worker validates that token with Supabase before deleting the corresponding user through the Admin API. VirusTotal receives submitted URLs and may retain scan submissions under its service terms; do not submit confidential or access-token URLs to this scanner.

## Deploy the dashboard

Create a separate Cloudflare Pages project connected to this repository. Set the project root to `dashboard`, build command to `npm run build`, and build output directory to `dist` (generated as `dashboard/dist` in this repository). Set the `VITE_...` variables as Pages build-time environment variables using real Supabase project values. The React app renders its dashboard/auth flow at `/` and `/dashboard`; `/create` opens the new-card form for authenticated users and the auth screen otherwise. The `public/_redirects` rules send `/dashboard`, `/create`, `/c/:slug`, `/p/:token`, `/informationpage/*`, and unmatched app routes to the React SPA `index.html`. Add `bilgi.openstacktool.com` as the Pages custom domain and point its DNS to that Pages project. Deploy the API Worker on `api.openstacktool.com`, route `/api/*` to it, and configure its allowed origins as above. The main-site CTAs in the repository root link to the dashboard and card-creation routes. The repository-root `404.html` only maps `/c/:slug` links to the legacy viewer; unmatched paths no longer become card lookups. The existing `wrangler.toml` Worker and `src/index.js` are deliberately not changed by this app.

## Data and safety notes

- Email-registration consent is mandatory and saved in `auth.users` metadata; a database trigger rejects an email registration without both consent flags and records the acceptance time in `consent_records`.
- Dashboard queries rely on Supabase RLS; the included schema restricts management and feedback reads to the card owner.
- Public and capability links are rendered as explicit external links with `noopener noreferrer`; the app never automatically redirects a visitor to a third-party site.
- Ratings of 1–3 stars can be sent to the business as private feedback, with a neutral Google Maps review link also available. Ratings of 4–5 can proceed to Google only after the visitor explicitly chooses the link. All external destinations are shown for confirmation before opening.
- This implementation supplies technical consent and data-rights UX, not legal advice. Have the final legal copy, retention, data residency, cookie use, SMS setup, and external processor disclosures reviewed for your actual service.
