# Privacy Policy

Effective date: 4 October 2026

InformationAndIbanCards displays NFC-linked digital cards for account details and customer reviews. The service processes information only as needed to retrieve a requested card and, when a visitor chooses to send it, transmit customer feedback.

## Data and use

When a card is opened, the browser sends its available `id`, `token`, and/or `slug` to the Supabase `get_nfc_card_data` RPC. The response may include the card's title, IBAN, account-holder name, bank name, links, access mode, or review destination. Card operators decide what information to publish and are responsible for the accuracy and lawful publication of their content.

When a visitor submits feedback, the browser sends the card ID, message, rating, and optional contact detail to the Supabase `submit_card_feedback` RPC. Do not submit passwords, payment credentials, or other sensitive information. The application does not transmit clipboard contents: copying an IBAN or receiver name is a visitor-initiated browser clipboard action, and this client does not retain it in local storage.

The current client has no analytics SDK, advertising tracker, cookie-setting code, or local-storage use. The card page loads Google Fonts from Google's font services, which may receive ordinary connection data such as an IP address. Hosting and Supabase may keep technical security and request logs under their own terms and retention settings. External links are subject to the destination's privacy practices.

## Providers, retention, and security

Supabase provides the REST/RPC database interface; the static hosting provider serves the website. Database retention and deletion are controlled by the project operator and are not set by this front end. The operator must configure least-privilege database grants, row-level security, and appropriate deletion and backup practices. The browser-visible Supabase key is a publishable key, not a secret; a service-role key must never be shipped to the browser.

## Your rights and contact

Depending on applicable law, visitors may have rights to access, correct, erase, restrict, object to, or obtain a copy of personal data. Contact the card issuer or service operator to exercise those rights. The service operator must insert its legal identity, postal address, and privacy contact before production use; those details were not supplied with the project.

## Updates

Material changes will be reflected here with a new effective date. This policy describes the current repository implementation and should be reviewed when providers or data flows change.