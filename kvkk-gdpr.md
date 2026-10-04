# KVKK and GDPR Compliance Statement

Effective date: 4 October 2026

This statement summarizes the current InformationAndIbanCards client-side data flows relevant to Türkiye's Law No. 6698 on the Protection of Personal Data (KVKK) and the EU General Data Protection Regulation (GDPR). It is informational and does not itself establish legal compliance. The organization operating each card and the service must determine their respective roles and obligations based on actual processing and contracts.

## Data flows and purposes

For card display, the browser sends supplied card identifiers (`id`, `token`, and/or `slug`) to a Supabase RPC and receives card content. If the visitor voluntarily submits feedback, the browser sends a message, rating, card ID, and optional contact detail to a second RPC. Copying an IBAN or account-holder name is performed locally by the browser; this client does not send clipboard contents to the service. The current client has no analytics SDK, cookie-setting code, or local-storage use. Hosting and database providers may separately process technical logs.

The card operator is responsible for determining the purpose and legal basis for publishing card content and collecting feedback, providing required notices, minimizing data, setting retention periods, and responding to data-subject requests. The service operator and providers must document their roles and processing arrangements. Do not enter special-category or unnecessary financial data in feedback.

## Rights and requests

Subject to applicable law, individuals may have rights to access, rectify, erase, restrict, object to, or port personal data and to complain to a supervisory authority. Requests should be directed to the organization that issued the card or controls the relevant database. The responsible controller must verify the request and respond within applicable statutory deadlines.

## Transfers and safeguards

Supabase and static hosting may process data in locations outside the visitor's country. The responsible organization must identify provider locations, assess international transfer rules under KVKK and GDPR, and put required safeguards and processor agreements in place. It must also configure least-privilege access, database row-level security, incident handling, and retention/deletion controls.

## Operator details required

Before production use, publish the controller/service operator's legal name, address, privacy contact, applicable KVKK data-controller contact or registry details where required, and the means for submitting rights requests. These facts were not included in the project repository, so this statement intentionally does not invent them. Review this statement with qualified counsel against the actual hosting, Supabase configuration, and card-operator arrangements.