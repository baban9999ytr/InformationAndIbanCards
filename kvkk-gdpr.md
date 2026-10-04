# KVKK and GDPR Compliance Statement

Effective date: 4 October 2026

This statement summarizes the current InformationAndIbanCards client-side data flows relevant to Türkiye's Law No. 6698 on the Protection of Personal Data (KVKK) and the EU General Data Protection Regulation (GDPR). For operation of this platform, the data controller (Veri Sorumlusu) is **Mustafa Göksal**, an independent software developer and natural person.

## KVKK Article 10 notice

6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi kapsamında aydınlatma:

- **Veri sorumlusu:** Mustafa Göksal, bağımsız yazılım geliştiricisi ve gerçek kişi.
- **İletişim ve başvuru:** Gizlilik ve ilgili kişi başvuruları için [gogsalmustafa19@gmail.com](mailto:gogsalmustafa19@gmail.com) adresine yazabilirsiniz. Bildirim bölgesi Nilüfer / Bursa, Türkiye'dir. Kişisel mahremiyet nedeniyle açık sokak adresi yayımlanmamaktadır; yazılı bildirimler e-posta ile kabul edilir ve posta adresi bu e-posta üzerinden talep edilebilir.
- **İşleme amaçları:** Kartın istenen ziyaretçiye gösterilmesi, isteğe bağlı geri bildirimlerin alınması ve yanıtlanması, hizmetin güvenliğinin sağlanması ve ilgili kişi başvurularının yönetilmesi.
- **İşlenen veri ve toplama yöntemi:** Kart görüntüleme isteği sırasında tarayıcıdan iletilen kart kimliği/token/slug ve kart içeriği; ziyaretçinin isteğe bağlı olarak gönderdiği değerlendirme, mesaj ve iletişim bilgisi; barındırma/veritabanı sağlayıcılarının bağlantı ve güvenlik kayıtları.
- **Alıcılar ve aktarım:** İstekler, kart verisinin saklanması ve sunulması için Supabase altyapısına; web sayfalarının sunulması için statik barındırma sağlayıcısına iletilir. Hizmet sayfası Google Fonts kullanır. Sağlayıcıların işleme konumları ve yurt dışı aktarım mekanizmaları dağıtım yapılandırmasına bağlıdır ve operatör tarafından doğrulanmalıdır.
- **Hukuki sebep:** İşleme, somut amaca göre KVKK'nın 5. maddesinde yer alan uygulanabilir hukuki sebeplere dayanır; gerekli olduğu durumlarda açık rıza alınır. Operatör, canlı veritabanı/barındırma yapılandırması ve gerçek işleme amaçlarına göre hukuki sebebi kayıt altına alır.
- **Haklar ve başvuru:** KVKK'nın 11. maddesindeki haklarınızı kullanmak için [gogsalmustafa19@gmail.com](mailto:gogsalmustafa19@gmail.com) adresine başvurabilirsiniz. Başvurular KVKK ve ilgili başvuru usulleri uyarınca değerlendirilir.

The notice below describes the repository's current client implementation. Other card publishers may independently determine purposes and means for information they submit; their role and notices depend on the actual arrangement.

## Data flows and purposes

For card display, the browser sends supplied card identifiers (`id`, `token`, and/or `slug`) to a Supabase RPC and receives card content. If the visitor voluntarily submits feedback, the browser sends a message, rating, card ID, and optional contact detail to a second RPC. Copying an IBAN or account-holder name is performed locally by the browser; this client does not send clipboard contents to the service. The current client has no analytics SDK, cookie-setting code, or local-storage use. Hosting and database providers may separately process technical logs.

Card publishers are responsible for the accuracy and lawful publication of information they provide. The service operator must document actual roles, applicable legal bases, retention periods, and provider arrangements. Do not enter special-category or unnecessary financial data in feedback.

## Rights and requests

Subject to applicable law, individuals may have rights to access, rectify, erase, restrict, object to, or port personal data and to complain to a supervisory authority. For platform processing, send requests to [gogsalmustafa19@gmail.com](mailto:gogsalmustafa19@gmail.com). Requests about data a card publisher independently controls may also need to be sent to that publisher.

## Transfers and safeguards

Supabase and static hosting may process data in locations outside the visitor's country. The operator must identify the actual provider locations, assess international transfer rules under KVKK and GDPR, and put required safeguards and processor agreements in place. It must also configure least-privilege access, database row-level security, incident handling, and retention/deletion controls.

## VERBİS registration

Mustafa Göksal states that, as a natural-person data controller and while the applicable employee-count and annual financial-balance-sheet thresholds and other conditions in current Personal Data Protection Board decisions are met, he is exempt from the VERBİS registration obligation (VERBİS kayıt yükümlülüğünden muaftır). This stated exemption must be reassessed if the processing, controller status, or applicable thresholds/Board decisions change.
