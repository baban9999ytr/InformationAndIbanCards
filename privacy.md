# Privacy Policy

Effective date: 4 October 2026

This policy describes the data flows implemented by InformationAndIbanCards. The service displays digital card details and, for Google Review cards, can send feedback to the service database. The organization or person that issued a card controls the card content and is responsible for providing any notices required for that content.

## Information processed

- **Card lookup:** The browser sends the supplied card `id`, `token`, and/or `slug` to the Supabase RPC `get_nfc_card_data`. The response can contain the card title, type, access mode, slug, bank name, IBAN, account-holder name, social links, and Google review URL. The exact fields depend on the card.
- **Feedback:** If a visitor submits a low-rating feedback form, the browser sends the card ID, message, rating, and optional contact detail to `submit_card_feedback`. Do not include sensitive personal or financial information in feedback.
- **Clipboard:** Copy buttons write the displayed IBAN or account-holder name to the visitor's device clipboard after the visitor acts. The application does not send clipboard contents to its backend or store them in browser storage.
- **Technical requests:** Static hosting, the browser, and Supabase may process ordinary connection and security data (for example IP address, request time, and user agent) in their operational logs. Their terms and retention settings apply.

The current client code contains no analytics SDK and does not set cookies or use local storage. The card page loads Google Fonts from Google's font services, which may receive ordinary connection data such as an IP address. This does not disable technical logging by infrastructure providers or cookies used by the browser or linked third-party sites.

## Purposes and sharing

Card lookups retrieve the requested card, and feedback submissions deliver a visitor's report to the service database for the card operator. Supabase processes API requests as the database hosting provider. Information may also be processed by the static hosting provider to serve the site. The application does not sell personal information or include ad-targeting integrations in its current client code.

External links (including Instagram and Google review destinations) are operated by third parties. Their privacy notices and practices apply after a visitor follows a link.

## Retention and security

The repository's client code does not define database retention periods. The database operator must establish and enforce retention, access controls, backups, and deletion procedures for card records and submitted feedback. The public Supabase key is intended for browser use and is not a secret; database permissions and row-level security must prevent unauthorized access or changes. Never place a Supabase service-role key in this site.

## Choices and requests

Visitors can choose not to submit feedback or optional contact details. For platform processing, requests to access, correct, or delete information may be sent to Mustafa Göksal at [gogsalmustafa19@gmail.com](mailto:gogsalmustafa19@gmail.com). The operator's notice location is Nilüfer, Bursa, Türkiye; formal written notices are accepted via that email, and a postal address may be requested through it. Requests concerning content independently controlled by a card issuer may also need to be directed to that issuer.

## Changes and contact

Updates will be published on this page with a revised effective date. The named platform operator and privacy contact are Mustafa Göksal, [gogsalmustafa19@gmail.com](mailto:gogsalmustafa19@gmail.com). The full street address is withheld for personal privacy; the notice location is Nilüfer, Bursa, Türkiye.
