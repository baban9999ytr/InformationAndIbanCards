import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { scanExternalUrl, validateHttpsUrl } from "./security.js";
import { signInWithGoogle } from "./auth.js";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { LanguageSwitcher, useTranslation } from "./i18n.jsx";

const cardTypeLabel = {
  google_review: "Google yorum kartı",
  iban_card: "Dijital profil kartı",
};
const initialCard = {
  title: "",
  type: "google_review",
  access_mode: "public",
  slug: "",
  google_review_url: "",
  whatsapp: "",
  sms: "",
  instagram_url: "",
  email: "",
  iban: "",
  bank_name: "",
  extra_links: [],
  nfc_active: true,
  is_active: true,
  managed_by_admin: false,
  client_notes: "",
};
const appOrigin = (
  import.meta.env.VITE_APP_ORIGIN || "https://bilgi.openstacktool.com"
).replace(/\/$/, "");
const workerBase = (
  import.meta.env.VITE_WORKER_URL || appOrigin
).replace(/\/$/, "");
const mainSiteUrl =
  import.meta.env.VITE_MAIN_SITE_URL || "https://openstacktool.com";
const legalRouteDocuments = {
  "/tr/kullanim-kosullari": ["terms", "tr"],
  "/en/terms-of-service": ["terms", "en"],
  "/tr/gizlilik-politikasi": ["privacy", "tr"],
  "/en/privacy-policy": ["privacy", "en"],
  "/tr/kvkk": ["kvkk", "tr"],
  "/en/gdpr": ["kvkk", "en"],
  "/tr/cerez-politikasi": ["cookies", "tr"],
  "/en/cookie-policy": ["cookies", "en"],
  "/tr/iletisim": ["contact", "tr"],
  "/en/contact": ["contact", "en"],
};
const legacyLegalRouteDocuments = {
  "/terms-of-service": ["terms", "en"],
  "/privacy-policy": ["privacy", "en"],
  "/gdpr-kvkk": ["kvkk", "tr"],
  "/privacy-notice": ["kvkk", "tr"],
  "/cookie-policy": ["cookies", "en"],
};
const getLegalRouteTarget = (document, language) =>
  `${window.location.origin}/legal.html?document=${document}&lang=${language}`;
const formatIban = (value) =>
  value.replace(/\s+/g, "").toUpperCase().match(/.{1,4}/g)?.join(" ") || "";
const legalLinksByLanguage = {
  tr: [
    { label: "Kullanım Koşulları", href: "/tr/kullanim-kosullari" },
    { label: "Gizlilik Politikası", href: "/tr/gizlilik-politikasi" },
    { label: "KVKK Aydınlatma Metni", href: "/tr/kvkk" },
    { label: "Çerez Politikası", href: "/tr/cerez-politikasi" },
    { label: "İletişim", href: "/tr/iletisim" },
  ],
  en: [
    { label: "Terms of Service", href: "/en/terms-of-service" },
    { label: "Privacy Policy", href: "/en/privacy-policy" },
    { label: "GDPR Notice", href: "/en/gdpr" },
    { label: "Cookie Policy", href: "/en/cookie-policy" },
    { label: "Contact", href: "/en/contact" },
  ],
};
const reservedRoutes = new Set([
  "c", "p", "dashboard", "create", "settings", "login", "informationpage",
  "terms-of-service", "privacy-policy", "gdpr-kvkk", "privacy-notice", "cookie-policy",
]);

function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isVerifiedAuthSession(session) {
  const user = session?.user;
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  return Boolean(
    user.email_confirmed_at ||
    user.confirmed_at ||
    user.phone_confirmed_at ||
    (provider && provider !== "email"),
  );
}

function isGoogleAuthSession(session) {
  return session?.user?.app_metadata?.provider === "google";
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.73 6C44.43 38.02 46.98 31.8 46.98 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}

function slugify(text) {
  return text
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function newAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePhone(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  else if (digits.startsWith("5")) digits = `90${digits}`;
  return digits;
}

function mailtoUrl(address, subject = "") {
  const email = address.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function cardUrl(card) {
  return card.access_mode === "public"
    ? `${appOrigin}/c/${encodeURIComponent(card.slug)}`
    : `${appOrigin}/p/${encodeURIComponent(card.access_token)}`;
}

function IconButton({ label, children, onClick, className = "" }) {
  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      className={`icon-button ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Footer({ onReport }) {
  const { t, language } = useTranslation();
  const legalLinks = legalLinksByLanguage[language] || legalLinksByLanguage.en;
  return (
    <footer className="footer">
      <span>© {new Date().getFullYear()} Bilgi · {t("Güvenli dijital bağlantılar.")}</span>
      <nav aria-label={t("Yasal bağlantılar")}>
        <a href={mainSiteUrl} target="_blank" rel="noopener noreferrer">
          {t("Ana site")}
        </a>
        {legalLinks.map((link) => (
          <a href={link.href} key={link.href} target="_blank" rel="noopener noreferrer">
            {t(link.label)}
          </a>
        ))}
        <button className="footer-report" onClick={onReport}>{t("Kötüye kullanım bildirimi")}</button>
      </nav>
    </footer>
  );
}

function AbuseReportModal({ context, onClose }) {
  const { t } = useTranslation();
  const [reportedUrl, setReportedUrl] = useState(context?.reportedUrl || window.location.href);
  const [reporterEmail, setReporterEmail] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    let safeUrl;
    try {
      safeUrl = validateHttpsUrl(reportedUrl);
    } catch {
      setError(t("Lütfen geçerli bir HTTPS URL girin."));
      return;
    }
    if (details.trim().length < 10) {
      setError(t("Açıklama en az 10 karakter olmalıdır."));
      return;
    }
    if (!supabase) {
      setError(t("Supabase ayarları bulunamadı. Uygulamayı başlatmak için ortam değişkenlerini yapılandırın."));
      return;
    }
    setBusy(true);
    try {
      const { error: submitError } = await supabase
        .from("abuse_reports")
        .insert({
          card_id: context?.cardId || null,
          reported_url: safeUrl,
          reporter_email: reporterEmail.trim(),
          reason_category: reason,
          details: details.trim(),
        });
      if (submitError) throw submitError;
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError.message || t("Bildirim gönderilemedi. Lütfen tekrar deneyin."));
    } finally {
      setBusy(false);
    }
  }

  const reasons = [
    ["phishing", "Kimlik avı"],
    ["malware", "Kötü amaçlı yazılım"],
    ["defamation", "İftira / hakaret"],
    ["copyright", "Telif hakkı ihlali"],
    ["other", "Diğer"],
  ];
  return (
    <div className="modal-backdrop report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="abuse-report-title">
        <header className="modal-header">
          <div><p className="eyebrow">{t("İnceleme ekibine güvenli bildirim")}</p><h2 id="abuse-report-title">{t("Kötüye kullanım bildirimi")}</h2></div>
          <IconButton label={t("Raporu kapat")} onClick={onClose}><X size={19} /></IconButton>
        </header>
        {submitted ? (
          <div className="report-success"><span className="settings-icon"><ShieldCheck size={19} /></span><h3>{t("Bildiriminiz alındı. İnceleme ekibimiz değerlendirecektir.")}</h3><button className="button button-primary" onClick={onClose}>{t("Bildirimi kapat")}</button></div>
        ) : (
          <form className="report-form" onSubmit={submit}>
            <p>{t("Kart veya bağlantı hakkında bildirim gönderin.")}</p>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <TextField label={t("Bildirilen URL")} type="url" value={reportedUrl} onChange={(event) => setReportedUrl(event.target.value)} required />
            <TextField label={t("E-posta adresiniz")} type="email" value={reporterEmail} onChange={(event) => setReporterEmail(event.target.value)} required />
            <label className="field"><span>{t("Bildirim nedeni")} *</span><select value={reason} onChange={(event) => setReason(event.target.value)} required><option value="">{t("Neden seçin")}</option>{reasons.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
            <label className="field"><span>{t("Açıklama")} *</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={5000} minLength={10} required placeholder={t("En fazla 5000 karakter")} /></label>
            <div className="modal-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>{t("Vazgeç")}</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{busy ? t("İşleniyor…") : t("Bildirimi gönder")}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

function PublicLanding({ onReport }) {
  const { t } = useTranslation();
  return (
    <main className="public-page">
      <header className="public-header">
        <a className="brand public-brand" href="/"><span className="brand-symbol">b.</span><span>bilgi</span></a>
        <LanguageSwitcher />
      </header>
      <article className="public-card landing-public-card">
        <p className="eyebrow">{t("Güvenli dijital bağlantılar.")}</p>
        <h1>InformationAndIbanCards</h1>
        <p className="landing-description">{t("Share account details or collect customer feedback through a simple NFC or web link.")}</p>
        <div className="landing-actions">
          <a className="button button-primary button-wide" href="/login">{t("Giriş Yap / Dashboard")}</a>
          <a className="button button-secondary button-wide" href="/create">{t("NFC Kart Oluştur")}</a>
        </div>
      </article>
      <Footer onReport={onReport} />
    </main>
  );
}

function PublicNotFound({ onReport, message }) {
  const { t } = useTranslation();
  return (
    <main className="public-page">
      <header className="public-header">
        <a className="brand public-brand" href="/"><span className="brand-symbol">b.</span><span>bilgi</span></a>
        <LanguageSwitcher />
      </header>
      <article className="public-card not-found-card">
        <div className="empty-icon"><Link2 /></div>
        <h1>{t("Kart bulunamadı")}</h1>
        <p>{message || t("Bu bağlantı geçersiz veya artık erişilebilir değil.")}</p>
        <a className="button button-primary" href="/">{t("Ana sayfaya dön")}</a>
      </article>
      <Footer onReport={onReport} />
    </main>
  );
}

function LegalRouteRedirect({ target }) {
  const { t } = useTranslation();
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <main className="public-page legal-redirect">
      <p>{t("Yasal bilgilendirme sayfasına yönlendiriliyorsunuz.")}</p>
      <a href={target}>{t("Devam et")}</a>
    </main>
  );
}

function EmailVerificationNotice({ email, onResend, busy }) {
  const { t } = useTranslation();
  return (
    <section className="email-verification-notice" role="status">
      <div className="empty-icon"><FileText size={21} /></div>
      <h2>{t("E-postanızı doğrulayın")}</h2>
      <p>{t("Etkinleştirme bağlantısını e-posta adresinize gönderdik:")} <strong>{email}</strong></p>
      <p>{t("Hesabınıza erişmek için e-postanızdaki bağlantıyı açın.")}</p>
      <button className="text-button" type="button" disabled={busy} onClick={onResend}>
        {busy ? <LoaderCircle className="spin" size={15} /> : null}{t("Doğrulama e-postasını yeniden gönder")}
      </button>
    </section>
  );
}

function AuthScreen({ onAuthenticated, onReport, initialNotice = "" }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("email");
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [fullName, setFullName] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const validPassword = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  async function submitEmail(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) return;
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("Geçerli bir e-posta adresi girin."));
      return;
    }
    if (mode === "register" && (!terms || !validPassword || !fullName.trim())) {
      setError(t("Kayıt için adınızı, güçlü bir şifreyi ve zorunlu onayı tamamlayın."));
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${appOrigin}/dashboard`,
            data: {
              full_name: fullName.trim(),
              signup_channel: "email",
              terms_accepted: true,
              kvkk_consent: true,
              age_confirmed: true,
              marketing_opt_in: marketingOptIn,
              terms_accepted_at: new Date().toISOString(),
              kvkk_consent_at: new Date().toISOString(),
            },
          },
        });
        if (authError) throw authError;
        setVerificationEmail(normalizedEmail);
        if (data.session) {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) setError(signOutError.message);
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (authError) throw authError;
        if (!isVerifiedAuthSession(data.session)) {
          await supabase.auth.signOut();
          setVerificationEmail(normalizedEmail);
          return;
        }
        onAuthenticated(data.session);
      }
    } catch (authError) {
      setError(authError.message || t("İşlem tamamlanamadı."));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setError("");
    setNotice("");
    setOauthBusy(true);
    try {
      await signInWithGoogle(supabase, `${window.location.origin}/dashboard`);
    } catch (authError) {
      setError(authError.message || t("Google ile giriş yapılamadı."));
      setOauthBusy(false);
    }
  }

  async function resendVerification() {
    if (!supabase || !verificationEmail) return;
    setError("");
    setResendingVerification(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: verificationEmail,
        options: { emailRedirectTo: `${appOrigin}/dashboard` },
      });
      if (resendError) throw resendError;
      setNotice(t("Doğrulama e-postasını yeniden gönderdik."));
    } catch (resendError) {
      setError(resendError.message || t("Doğrulama e-postası gönderilemedi."));
    } finally {
      setResendingVerification(false);
    }
  }

  async function requestOtp(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) return;
    setBusy(true);
    try {
      if (!otpSent) {
        const { error: authError } = await supabase.auth.signInWithOtp({
          phone: `+${normalizePhone(phone)}`,
          options: { shouldCreateUser: false },
        });
        if (authError) throw authError;
        setOtpSent(true);
        setNotice(t("Doğrulama kodu telefonunuza gönderildi."));
      } else {
        const { data, error: authError } = await supabase.auth.verifyOtp({
          phone: `+${normalizePhone(phone)}`,
          token: otp,
          type: "sms",
        });
        if (authError) throw authError;
        onAuthenticated(data.session);
      }
    } catch (authError) {
      setError(authError.message || t("SMS doğrulaması tamamlanamadı."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand auth-brand" href="/">
          <span className="brand-symbol">b.</span>
          <span>bilgi</span>
        </a>
        <div className="story-copy">
          <div className="eyebrow"><span className="live-dot" /> NFC & DİJİTAL KART YÖNETİMİ</div>
          <h1>İyi bağlantılar,<br /><span>iyi izlenimler</span> bırakır.</h1>
          <p>İşletmenizin dijital kartlarını tek bir yerden oluşturun, paylaşın ve yönetin.</p>
          <div className="story-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-card">
              <span className="art-chip"><Smartphone size={19} /></span>
              <span className="art-brand">bilgi<span>.</span></span>
              <span className="art-lines"><i /><i /><i /></span>
              <span className="art-wave">)))</span>
            </div>
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">✦</span>
          </div>
        </div>
        <div className="story-bottom"><ShieldCheck size={16} /> Verileriniz güvenli ve size aittir.</div>
      </section>
      <section className="auth-side">
        <div className="auth-side-top">
          <LanguageSwitcher />
          <span>{t("Yeni misiniz?")}</span>
          <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setTab("email"); setVerificationEmail(""); setError(""); setNotice(""); setTerms(false); setMarketingOptIn(false); }}>
            {mode === "login" ? t("Hesap oluştur") : t("Giriş yap")}
          </button>
        </div>
        <div className="auth-form-wrap">
          <div className="mobile-brand brand"><span className="brand-symbol">b.</span><span>bilgi</span></div>
          <div className="form-intro">
            <p className="eyebrow">{t("HESABINIZA ERİŞİN")}</p>
            <h2>{mode === "login" ? t("Tekrar hoş geldiniz") : t("Aramıza katılın")}</h2>
            <p>{t("Devam etmek için bilgilerinizi girin.")}</p>
          </div>
          {mode === "login" && <div className="auth-tabs" role="tablist" aria-label="Giriş yöntemi">
            <button className={tab === "email" ? "active" : ""} type="button" onClick={() => { setTab("email"); setTerms(false); setOtpSent(false); }} role="tab">{t("E-posta")}</button>
            <button className={tab === "phone" ? "active" : ""} type="button" onClick={() => { setTab("phone"); setTerms(false); setOtpSent(false); }} role="tab">{t("Telefon ile giriş")}</button>
          </div>}
          {!supabaseConfigured && (
            <div className="inline-warning">{t("Supabase ayarları bulunamadı. Uygulamayı başlatmak için ortam değişkenlerini yapılandırın.")}</div>
          )}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {notice && <div className="inline-success" role="status">{notice}</div>}
          {verificationEmail ? (
            <EmailVerificationNotice email={verificationEmail} onResend={resendVerification} busy={resendingVerification} />
          ) : tab === "email" ? (
            <form className="stack-form" onSubmit={submitEmail}>
              {mode === "register" && (
                <label>{t("Ad soyad")}<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required placeholder={t("Adınız Soyadınız")} /></label>
              )}
              <label>{t("E-posta adresi")}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} onBlur={(event) => setEmail(event.target.value.trim())} required placeholder="name@business.com" /></label>
              <label>{t("Şifre")}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={t(mode === "login" ? "Şifreniz" : "En az 8 karakter, harf ve rakam")} /></label>
              {mode === "register" && <p className="helper-copy">{t("Şifreniz en az 8 karakter olmalı ve en az bir harf ile bir rakam içermelidir.")}</p>}
              {mode === "register" && (
                <div className="consent-fields">
                  <label className="check-row"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /><span>{t("Şunları kabul ediyorum:")} <a href={legalLinks[0].href} target="_blank" rel="noreferrer">{t("Kullanım Koşulları")}</a> {t("ve")} <a href={legalLinks[1].href} target="_blank" rel="noreferrer">{t("Gizlilik Politikası")}</a>. {t("En az 18 yaşında olduğumu veya ülkemdeki yasal asgari yaş şartını karşıladığımı onaylıyorum.")} <b>*</b></span></label>
                  <label className="check-row"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} /><span>{t("Ürün güncellemelerini, ipuçlarını ve tanıtım haberlerini e-posta ile almak istiyorum.")}</span></label>
                </div>
              )}
              <button className="button button-primary button-wide" disabled={busy || !supabaseConfigured || (mode === "register" && (!terms || !validPassword || !fullName.trim()))}>
                {busy ? <LoaderCircle className="spin" size={17} /> : null}
                {mode === "login" ? t("Giriş yap") : t("Hesabımı oluştur")}
              </button>
              <button className="button google-auth-button button-wide" type="button" disabled={oauthBusy || !supabaseConfigured} onClick={continueWithGoogle}>
                {oauthBusy ? <LoaderCircle className="spin" size={17} /> : <GoogleIcon />}
                {t("Google ile devam et")}
              </button>
            </form>
          ) : (
            <form className="stack-form" onSubmit={requestOtp}>
              <label>{t("Telefon numarası")}<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(normalizePhone(event.target.value))} required placeholder="905551234567" /></label>
              {otpSent && <label>{t("SMS doğrulama kodu")}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} required placeholder={t("6 haneli kod")} /></label>}
              <p className="helper-copy">{t("SMS ile giriş için numaranızı ülke koduyla birlikte yazın.")}</p>
              <button className="button button-primary button-wide" disabled={busy || !supabaseConfigured}>
                {busy ? <LoaderCircle className="spin" size={17} /> : null}
                {otpSent ? t("Kodu doğrula") : t("SMS kodu gönder")}
              </button>
            </form>
          )}
          <p className="auth-switch">
            {mode === "login" ? t("Henüz hesabınız yok mu?") : t("Zaten hesabınız var mı?")}
            <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setTab("email"); setError(""); setNotice(""); setTerms(false); setMarketingOptIn(false); setVerificationEmail(""); }}>
              {mode === "login" ? t("Kayıt olun") : t("Giriş yapın")}
            </button>
          </p>
          {initialNotice && !notice && <div className="inline-warning">{initialNotice}</div>}
          {mode === "register" && <p className="auth-terms">{t("Kayıt olmak için e-posta adresinizi doğrulamanız gerekir.")}</p>}
        </div>
        <Footer onReport={onReport} />
      </section>
    </div>
  );
}

function PublicCard({ token, onReport }) {
  const { t } = useTranslation();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [pendingExternal, setPendingExternal] = useState(null);
  const [externalLinkError, setExternalLinkError] = useState("");
  const [cardId, setCardId] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const copyStatusTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(copyStatusTimer.current), []);
  useEffect(() => {
    let alive = true;
    async function resolve() {
      if (!supabase) {
        setError(t("Bu kart şu anda görüntülenemiyor."));
        setLoading(false);
        return;
      }
      const { data, error: functionError } = await supabase.functions.invoke("resolve-card", {
        body: { key: token },
      });
      if (!alive) return;
      if (functionError || !data?.card) setError(t("Kart bulunamadı veya artık erişilebilir değil."));
      else {
        setCard(data.card);
        setCardId(data.card.id);
      }
      setLoading(false);
    }
    resolve();
    return () => { alive = false; };
  }, [token, t]);

  const links = useMemo(() => {
    if (!card) return [];
    return [
      card.type !== "google_review" && card.google_review_url && { label: "Google'da değerlendirin", url: card.google_review_url },
      card.instagram_url && { label: "Instagram profili", url: card.instagram_url },
      ...(card.extra_links || []).map((item) => ({ label: item.label, url: item.url })),
    ].filter(Boolean);
  }, [card]);

  async function copyToClipboard(value, field) {
    window.clearTimeout(copyStatusTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus({ field, success: true });
    } catch {
      setCopyStatus({ field, success: false });
    }
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus(null), 2000);
  }

  async function submitFeedback(event) {
    event.preventDefault();
    setFeedbackError("");
    setFeedbackBusy(true);
    try {
      const { error: submitError } = await supabase.functions.invoke("submit-feedback", {
        body: { key: token, rating, customer_message: message, customer_contact: contactEmail },
      });
      if (submitError) throw submitError;
      setFeedbackSent(true);
    } catch (submitError) {
      setFeedbackError(submitError.message || t("Geri bildiriminiz gönderilemedi. Lütfen tekrar deneyin."));
    } finally {
      setFeedbackBusy(false);
    }
  }

  function requestExternal(destination) {
    setExternalLinkError("");
    try {
      const target = new URL(destination.url);
      const safeHttps = target.protocol === "https:" && Boolean(target.hostname) && !target.username && !target.password;
      const safeMailto = target.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.pathname);
      const safeSms = target.protocol === "sms:" && /^\+?\d{7,15}$/.test(target.pathname);
      if (!safeHttps && !safeMailto && !safeSms) throw new Error();
    } catch {
      setExternalLinkError(t("Bu bağlantı güvenli değil veya desteklenmiyor."));
      return;
    }
    setPendingExternal(destination);
  }

  if (!loading && error) {
    return <PublicNotFound onReport={onReport} message={t(error)} />;
  }

  return (
    <main className="public-page">
      <header className="public-header">
        <a className="brand public-brand" href="/"><span className="brand-symbol">b.</span><span>bilgi</span></a>
        <div><LanguageSwitcher /><button className="public-report-link" onClick={() => onReport({ cardId, reportedUrl: window.location.href })}>{t("Kötüye kullanım bildirimi")}</button></div>
      </header>
      <article className="public-card">
        {loading ? <LoaderCircle className="spin" /> : error ? <><div className="empty-icon"><Link2 /></div><h1>{t("Kart bulunamadı")}</h1><p>{t(error)}</p></> : !card.is_active ? (
          <div className="inactive-card-notice" role="status">
            <div className="empty-icon"><ShieldCheck /></div>
            <h1>{card.title}</h1>
            <p>{t("Bu kart geçici olarak devre dışı bırakılmıştır.")}</p>
          </div>
        ) : (
          <>
            <div className="public-avatar">{(card.title || "B").slice(0, 1).toLocaleUpperCase("tr")}</div>
            <p className="eyebrow">{cardTypeLabel[card.type] ? t(cardTypeLabel[card.type]) : t("DİJİTAL KART")}</p>
            <h1 className="public-card-title">
              {card.title}
              {card.iban && (
                <button
                  className={`copy-icon-button${copyStatus?.field === "name" && copyStatus.success ? " is-copied" : ""}`}
                  type="button"
                  aria-label={t(copyStatus?.field === "name" && copyStatus.success ? "Ad kopyalandı." : "Adı kopyala")}
                  title={t(copyStatus?.field === "name" && copyStatus.success ? "Ad kopyalandı." : "Adı kopyala")}
                  onClick={() => copyToClipboard(card.title, "name")}
                >
                  {copyStatus?.field === "name" && copyStatus.success ? <Check size={16} /> : <Copy size={16} />}
                </button>
              )}
            </h1>
            {card.bank_name && !card.iban && <p className="public-subtitle">{card.bank_name}</p>}
            {card.iban && (
              <section className="iban-box" aria-label={t("IBAN bilgileri")}>
                <div className="iban-box-header">
                  <span className="iban-label">{t("IBAN")}</span>
                  {card.bank_name && <span className="iban-bank-tag">{card.bank_name}</span>}
                </div>
                <div className="iban-value-row">
                  <strong className="iban-text">{formatIban(card.iban)}</strong>
                  <button
                    className={`button-copy${copyStatus?.field === "iban" && copyStatus.success ? " is-copied" : ""}`}
                    type="button"
                    onClick={() => copyToClipboard(card.iban.replace(/\s+/g, "").toUpperCase(), "iban")}
                  >
                    {copyStatus?.field === "iban" && copyStatus.success ? <Check size={15} /> : <Copy size={15} />}
                    {copyStatus?.field === "iban" && copyStatus.success ? t("Kopyalandı") : t("IBAN'ı kopyala")}
                  </button>
                </div>
              </section>
            )}
            {copyStatus && (
              <p className={`copy-feedback${copyStatus.success ? "" : " is-error"}`} role="status" aria-live="polite">
                {copyStatus.success
                  ? t(copyStatus.field === "iban" ? "IBAN kopyalandı." : "Ad kopyalandı.")
                  : t("Panoya kopyalanamadı.")}
              </p>
            )}
            {card.email && <button className="contact-link contact-button" onClick={() => requestExternal({ label: "E-posta gönder", url: mailtoUrl(card.email) })}><UserRound size={16} /> {t("E-posta gönder")}</button>}
            {card.type === "google_review" && (
              <section className="rating-section">
                <h2>{t("Deneyiminiz nasıldı?")}</h2>
                <p>{t("Geri bildiriminiz işletmenin hizmetini geliştirmesine yardımcı olur.")}</p>
                <div className="rating-buttons" role="group" aria-label={t("1 ile 5 arasında puan verin")}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button type="button" className={rating === value ? "rating-selected" : ""} aria-label={`${value} ${t("yıldız")}`} aria-pressed={rating === value} key={value} onClick={() => { setRating(value); setFeedbackSent(false); }}>
                      {value} <span>★</span>
                    </button>
                  ))}
                </div>
                {rating >= 1 && rating <= 3 && (feedbackSent ? (
                  <>
                    <div className="inline-success" role="status">{t("Geri bildiriminiz için teşekkür ederiz. İşletme sizinle iletişime geçebilir.")}</div>
                    {(card.whatsapp || card.sms || card.instagram_url || card.email) && (
                      <div className="direct-contact">
                        <p>{t("İşletmeyle doğrudan iletişim kurun:")}</p>
                        {card.whatsapp && <button onClick={() => requestExternal({ label: "WhatsApp", url: `https://wa.me/${card.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(t("Kartınız üzerinden geri bildirim paylaşmak istiyorum."))}` })}>{t("WhatsApp")} <ExternalLink size={13} /></button>}
                        {card.sms && <button onClick={() => requestExternal({ label: "SMS", url: `sms:+${card.sms.replace(/\D/g, "")}?body=${encodeURIComponent(t("Kartınız üzerinden geri bildirim paylaşmak istiyorum."))}` })}>{t("SMS")} <ExternalLink size={13} /></button>}
                        {card.instagram_url && <button onClick={() => requestExternal({ label: "Instagram", url: card.instagram_url })}>{t("Instagram")} <ExternalLink size={13} /></button>}
                        {card.email && <button onClick={() => requestExternal({ label: "E-posta", url: mailtoUrl(card.email, t("Kart üzerinden geri bildirim")) })}>{t("E-posta")} <ExternalLink size={13} /></button>}
                      </div>
                    )}
                  </>
                ) : (
                  <form className="low-rating-form" onSubmit={submitFeedback}>
                    <p>{t("Yaşadığınız deneyimi doğrudan işletmeye iletin.")}</p>
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} required placeholder={t("Geri bildiriminizi buraya yazın...")} />
                    <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder={t("E-posta adresiniz (isteğe bağlı)")} />
                    {feedbackError && <div className="inline-error" role="alert">{t(feedbackError)}</div>}
                    <button className="button button-primary button-wide" disabled={feedbackBusy}>{feedbackBusy ? <LoaderCircle className="spin" size={16} /> : null}{t("Geri bildirimi gönder")}</button>
                  </form>
                ))}
                {rating >= 1 && rating <= 3 && <button className="neutral-review-link" onClick={() => requestExternal({ label: "Google Haritalar yorumu", url: card.google_review_url })}>{t("Veya doğrudan Google Haritalar üzerinde yorum yapın")}</button>}
                {rating >= 4 && <div className="review-next-step"><p>{t("Google'da yorumunuzu paylaşmak ister misiniz?")}</p><button className="button button-primary button-wide" onClick={() => requestExternal({ label: "Google Haritalar yorumu", url: card.google_review_url })}>{t("Google'da Yorum Yap")} <ExternalLink size={15} /></button><small>{t("Devam etmeden önce açılacak hedef adresi görebilirsiniz.")}</small></div>}
              </section>
            )}
            {links.length > 0 && (
              <div className="public-links">
                <p className="safe-notice"><ShieldCheck size={15} /> {t("Harici bağlantıyı açmadan önce hedef adres onayınız için gösterilir.")}</p>
                {links.map((link) => (
                  <button className="public-link" onClick={() => requestExternal(link)} key={link.label}>
                    <span>{link.label}</span><ExternalLink size={16} />
                  </button>
                ))}
              </div>
            )}
            {pendingExternal && (
              <section className="external-confirmation" role="status" aria-live="polite">
                <div className="external-confirmation-title"><ShieldCheck size={16} /><strong>{t("Harici bağlantı")}</strong></div>
                <p><strong>{t(pendingExternal.label)}</strong> {t("bağlantısını açmak üzeresiniz. Hedef adres:")}</p>
                <code>{pendingExternal.url}</code>
                <div><button className="button button-secondary" onClick={() => setPendingExternal(null)}>{t("Vazgeç")}</button><a className="button button-primary" href={pendingExternal.url} target="_blank" rel="noopener noreferrer">{t("Bağlantıya devam et")} <ExternalLink size={14} /></a></div>
              </section>
            )}
            {externalLinkError && <div className="inline-error" role="alert">{externalLinkError}</div>}
          </>
        )}
      </article>
      <Footer onReport={onReport} />
    </main>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder, required = false, ...props }) {
  return (
    <label className="field">
      <span>{label}{required && <b> *</b>}</span>
      <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} required={required} {...props} />
    </label>
  );
}

function CardModal({ card, onClose, onSaved, isAdmin, user, clients, startManaged = false }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => card
    ? { ...initialCard, ...card, extra_links: card.extra_links || [] }
    : {
      ...initialCard,
      managed_by_admin: startManaged,
      user_id: startManaged && clients.length ? clients[0].id : user.id,
    });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(card?.slug));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  function update(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "title" && !slugManuallyEdited ? { slug: slugify(value) } : {}),
    }));
  }

  function updateExtra(index, key, value) {
    setForm((previous) => ({
      ...previous,
      extra_links: previous.extra_links.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!form.title.trim()) throw new Error(t("Kart adı zorunludur."));
      if (form.access_mode === "public" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
        throw new Error(t("Herkese açık kart için geçerli bir kısa bağlantı yazın."));
      }
      if (form.type === "google_review" && !form.google_review_url) {
        throw new Error(t("Google yorum bağlantısı zorunludur."));
      }
      if (form.type === "iban_card" && !form.iban.trim()) throw new Error(t("IBAN alanı zorunludur."));
      if ([form.whatsapp, form.sms].some((phone) => phone && !/^\d{7,15}$/.test(normalizePhone(phone)))) {
        throw new Error(t("Telefon numaralarını ülke koduyla birlikte, yalnızca rakam olarak girin."));
      }
      setScanning(true);
      const fieldsToScan = [
        "google_review_url",
        "instagram_url",
      ].filter((key) => (form.type === "google_review" ? key === "google_review_url" || Boolean(form[key]) : key === "instagram_url" && Boolean(form[key])));
      const scanned = {};
      for (const key of fieldsToScan) {
        if (form[key]) scanned[key] = await scanExternalUrl(form[key]);
      }
      const extraLinks = [];
      for (const item of form.extra_links) {
        if (!item.label.trim() || !item.url.trim()) throw new Error(t("Ek bağlantılarda etiket ve URL alanlarını birlikte doldurun."));
        extraLinks.push({ label: item.label.trim(), url: await scanExternalUrl(item.url) });
      }
      setScanning(false);
      const values = {
        title: form.title.trim(),
        type: form.type,
        access_mode: form.access_mode,
        slug: form.access_mode === "public" ? form.slug : null,
        access_token: form.access_mode === "private" ? (card?.access_token || newAccessToken()) : null,
        google_review_url: form.type === "google_review" ? (scanned.google_review_url || null) : null,
        whatsapp: form.type === "google_review" ? normalizePhone(form.whatsapp) || null : null,
        sms: form.type === "google_review" ? normalizePhone(form.sms) || null : null,
        instagram_url: scanned.instagram_url || null,
        email: form.email.trim() || null,
        iban: form.type === "iban_card" ? form.iban.replace(/\s/g, "").toUpperCase() : null,
        bank_name: form.type === "iban_card" ? form.bank_name.trim() || null : null,
        extra_links: extraLinks,
        nfc_active: form.nfc_active,
        user_id: isAdmin ? (form.user_id || user.id) : user.id,
        managed_by_admin: isAdmin && form.managed_by_admin,
        client_notes: isAdmin && form.managed_by_admin ? form.client_notes.trim() || null : null,
      };
      const query = card
        ? supabase.from("nfc_cards").update(values).eq("id", card.id).select().single()
        : supabase.from("nfc_cards").insert(values).select().single();
      const { data, error: saveError } = await query;
      if (saveError) throw saveError;
      onSaved(data);
    } catch (saveError) {
      setScanning(false);
      setError(saveError.message || t("Kart kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal card-modal" role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
        <header className="modal-header">
          <div><p className="eyebrow">{card ? t("KART AYARLARI") : t("YENİ KART")}</p><h2 id="card-modal-title">{card ? t("Kartı düzenle") : t("Yeni dijital kart oluştur")}</h2></div>
          <IconButton label={t("Pencereyi kapat")} onClick={onClose}><X size={19} /></IconButton>
        </header>
        <form className="modal-body" onSubmit={save}>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <div className="form-section">
            <h3>01 <span>{t("Kart türü")}</span></h3>
            <div className="choice-grid">
              {[
                ["google_review", "Google yorum kartı", "Müşteri yorumlarını güvenli şekilde toplayın"],
                ["iban_card", "Dijital profil kartı", "İletişim ve IBAN bilgilerinizi paylaşın"],
              ].map(([value, label, description]) => (
                <button type="button" className={`choice-card ${form.type === value ? "selected" : ""}`} key={value} onClick={() => update("type", value)}>
                  <span className="choice-icon">{value === "google_review" ? <Globe2 size={18} /> : <UserRound size={18} />}</span>
                  <strong>{t(label)}</strong><small>{t(description)}</small>
                  {form.type === value && <Check className="choice-check" size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="form-section">
            <h3>02 <span>{t("Görünürlük ve bağlantı")}</span></h3>
            <div className="segmented">
              <button type="button" className={form.access_mode === "public" ? "active" : ""} onClick={() => update("access_mode", "public")}><Globe2 size={15} /> {t("Herkese açık")}</button>
              <button type="button" className={form.access_mode === "private" ? "active" : ""} onClick={() => update("access_mode", "private")}><ShieldCheck size={15} /> {t("Gizli bağlantı")}</button>
            </div>
            {form.access_mode === "public" ? (
              <div className="slug-field"><span>{appOrigin}/c/</span><input value={form.slug} onChange={(event) => { setSlugManuallyEdited(true); update("slug", slugify(event.target.value)); }} placeholder="isletme-adi" required /></div>
            ) : (
              <p className="field-hint">{t("Kaydedildiğinde yalnızca bağlantıya sahip kişilerin erişebileceği güçlü, rastgele bir bağlantı oluşturulur.")}</p>
            )}
          </div>
          <div className="form-section">
            <h3>03 <span>{t("Kart bilgileri")}</span></h3>
            <TextField label={t("Kart / işletme adı")} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder={t("Örn. Mavi Kahve")} required />
            {form.type === "google_review" ? (
              <div className="field-grid">
                <TextField label={t("Google yorum bağlantısı")} type="url" value={form.google_review_url} onChange={(event) => update("google_review_url", event.target.value)} placeholder="https://g.page/r/..." required />
                <TextField label={t("Instagram URL (isteğe bağlı)")} type="url" value={form.instagram_url} onChange={(event) => update("instagram_url", event.target.value)} placeholder="https://instagram.com/..." />
                <TextField label={t("WhatsApp telefonu")} type="tel" value={form.whatsapp} onChange={(event) => update("whatsapp", normalizePhone(event.target.value))} placeholder="905551234567" />
                <TextField label={t("SMS telefonu")} type="tel" value={form.sms} onChange={(event) => update("sms", normalizePhone(event.target.value))} placeholder="905551234567" />
                <TextField label={t("Geri bildirim e-postası")} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="hello@business.com" />
              </div>
            ) : (
              <div className="field-grid">
                <TextField label={t("IBAN")} value={form.iban} onChange={(event) => update("iban", event.target.value)} placeholder={t("TR00 0000 0000 0000 0000 0000 00")} required />
                <TextField label={t("Banka adı")} value={form.bank_name} onChange={(event) => update("bank_name", event.target.value)} placeholder={t("Banka adı")} />
                <TextField label={t("Instagram URL (isteğe bağlı)")} type="url" value={form.instagram_url} onChange={(event) => update("instagram_url", event.target.value)} placeholder="https://instagram.com/..." />
                <TextField label={t("E-posta")} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="hello@business.com" />
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="form-section admin-card-fields">
              <h3><ShieldCheck size={15} /> <span>{t("Yönetici / bayi yönetimi")}</span></h3>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(form.managed_by_admin)}
                  onChange={(event) => {
                    update("managed_by_admin", event.target.checked);
                    if (event.target.checked) update("user_id", form.user_id || user.id);
                    else update("user_id", user.id);
                  }}
                />
                <span>{t("Müşteri için yönetilen kart")}</span>
              </label>
              {form.managed_by_admin && (
                <>
                  <label className="field">
                    <span>{t("Müşteri profili")}</span>
                    <select value={form.user_id || user.id} onChange={(event) => update("user_id", event.target.value)}>
                      <option value={user.id}>{t("Merkezi yönetim (admin)")}</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.full_name || client.email || client.phone || client.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t("Yalnızca yönetici notu")}</span>
                    <textarea value={form.client_notes || ""} onChange={(event) => update("client_notes", event.target.value)} maxLength={5000} placeholder={t("Ödeme, iletişim veya fiziksel konum notları")} />
                  </label>
                </>
              )}
            </div>
          )}
          <div className="form-section">
            <div className="section-heading-row"><h3>04 <span>{t("Ek bağlantılar")}</span></h3><button type="button" className="button button-secondary button-small" disabled={form.extra_links.length >= 3} onClick={() => update("extra_links", [...form.extra_links, { label: "", url: "" }])}><Plus size={15} /> {t("Bağlantı ekle")}</button></div>
            <p className="field-hint">{t("HTTPS adresleri güvenlik taramasından geçirilir. En fazla 3 bağlantı ekleyebilirsiniz.")}</p>
            {form.extra_links.map((item, index) => (
              <div className="extra-link-row" key={index}>
                <TextField label={t("Bağlantı etiketi")} value={item.label} onChange={(event) => updateExtra(index, "label", event.target.value)} placeholder={t("Örn. Menümüz")} />
                <TextField label={t("HTTPS adresi")} type="url" value={item.url} onChange={(event) => updateExtra(index, "url", event.target.value)} placeholder="https://..." />
                <IconButton label={t("Bağlantıyı kaldır")} className="danger-icon" onClick={() => update("extra_links", form.extra_links.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} /></IconButton>
              </div>
            ))}
          </div>
          <label className="check-row nfc-check"><input type="checkbox" checked={form.nfc_active} onChange={(event) => update("nfc_active", event.target.checked)} /><span>{t("NFC etiketi aktif")}</span></label>
          <div className="scan-status">{scanning ? <><LoaderCircle className="spin" size={15} /> {t("Bağlantılar güvenlik kontrolünden geçiriliyor…")}</> : <><ShieldCheck size={15} /> {t("Harici bağlantılar kaydetmeden önce güvenlik taramasından geçirilir.")}</>}</div>
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("Vazgeç")}</button><button className="button button-primary" disabled={busy || !supabaseConfigured}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{card ? t("Değişiklikleri kaydet") : t("Kartı oluştur")}</button></div>
        </form>
      </section>
    </div>
  );
}

function Sidebar({ section, onSection, onSignOut, user, mobileOpen, onClose, dark, onToggleTheme, isAdmin, pendingReports }) {
  const { t } = useTranslation();
  const roleLabel = isAdmin ? (user.role === "admin" ? t("Yönetici") : t("Bayi")) : t("Doğrulanmış kullanıcı");
  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Menüyü kapat" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><a className="brand" href="#"><span className="brand-symbol">b.</span><span>bilgi</span></a><span className="workspace-pill">DASHBOARD</span></div>
        <div className="workspace-card"><div className="workspace-avatar">{(user.user_metadata?.full_name || user.email || "B").slice(0, 1).toLocaleUpperCase("tr")}</div><div><strong>{user.user_metadata?.full_name || t("İşletme hesabım")}</strong><small>{roleLabel}</small></div><ChevronDown size={15} /></div>
        <p className="nav-caption">{t("MENÜ")}</p>
        <nav className="side-nav" aria-label="Ana menü">
          <button className={section === "overview" ? "selected" : ""} onClick={() => onSection("overview")}><LayoutDashboard size={17} /> {t("Genel Bakış")}</button>
          <button className={section === "cards" ? "selected" : ""} onClick={() => onSection("cards")}><Smartphone size={17} /> {t("Kartlarım")}</button>
          <button className={section === "feedback" ? "selected" : ""} onClick={() => onSection("feedback")}><FileText size={17} /> {t("Geri bildirimler")}</button>
          {isAdmin && <button className={section === "abuse" ? "selected" : ""} onClick={() => onSection("abuse")}><ShieldCheck size={17} /> {t("Kötüye kullanım bildirimleri")} {pendingReports > 0 && <span className="nav-count-badge">{pendingReports}</span>}</button>}
        </nav>
        <p className="nav-caption nav-caption-lower">{t("HESAP")}</p>
        <nav className="side-nav">
          <button className={section === "settings" ? "selected" : ""} onClick={() => onSection("settings")}><Settings size={17} /> {t("Ayarlar")}</button>
          <button onClick={onToggleTheme}><span className="nav-icon">{dark ? <Sun size={17} /> : <Moon size={17} />}</span>{dark ? t("Açık tema") : t("Koyu tema")}</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon"><CircleHelp size={18} /></span><strong>{t("Yardıma mı ihtiyacınız var?")}</strong><p>{t("Ekibimiz size yardımcı olmaya hazır.")}</p><a href="mailto:destek@openstacktool.com">{t("Destek ile iletişime geç")} <ArrowUpRight size={13} /></a></div>
          <button className="profile-row" onClick={onSignOut}><span className="profile-avatar">{(user.user_metadata?.full_name || user.email || "B").slice(0, 1).toLocaleUpperCase("tr")}</span><span className="profile-info"><strong>{user.user_metadata?.full_name || "Hesabım"}</strong><small>{user.email || user.phone}</small></span><LogOut size={16} /></button>
        </div>
      </aside>
    </>
  );
}

function CardRow({ card, onEdit, onDelete, onViewFeedback, onNotify, isAdmin = false, onToggleActive }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const url = cardUrl(card);
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      onNotify(t("Kart bağlantısı panoya kopyalandı."));
    } catch {
      onNotify(t("Bağlantı kopyalanamadı. Tarayıcı izinlerini kontrol edin."), true);
    }
  }
  return (
    <article className="card-row">
      <div className={`card-type-icon ${card.type === "iban_card" ? "type-iban" : ""}`}><Smartphone size={18} /></div>
      <div className="card-main">
        <div className="card-name-row"><h3>{card.title}</h3><span className={`status-badge ${card.access_mode === "public" ? "status-public" : "status-private"}`}><i />{card.access_mode === "public" ? t("Herkese açık") : t("Gizli")}</span></div>
        <p>{t(cardTypeLabel[card.type] || "Dijital kart")} <span>·</span> {card.nfc_active ? t("NFC aktif") : t("NFC kapalı")}
          {isAdmin && card.managed_by_admin && <> <span>·</span> {t("Yönetilen müşteri kartı")}</>}
          {!card.is_active && <> <span>·</span> <strong className="inactive-label">{t("Donduruldu")}</strong></>}
        </p>
        {isAdmin && card.client_notes && <small className="admin-note">{t("Yönetici notu")}: {card.client_notes}</small>}
        <span className="card-url">{url.replace(/^https?:\/\//, "")}</span>
      </div>
      <div className="card-actions">
        <a className="button button-quiet" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {t("Görüntüle")}</a>
        <button className="button button-quiet copy-action" onClick={copyUrl}><Copy size={14} /> {t("Bağlantıyı kopyala")}</button>
        <button className="button button-quiet edit-action" onClick={() => onEdit(card)}>{t("Düzenle")}</button>
        {isAdmin && <IconButton label={t(card.is_active ? "Kartı dondur" : "Kartı etkinleştir")} className={`active-toggle ${card.is_active ? "" : "is-frozen"}`} onClick={() => onToggleActive(card)}><ShieldCheck size={16} /></IconButton>}
        <div className="menu-wrap">
          <IconButton label={t("Diğer işlemler")} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18} /></IconButton>
          {menuOpen && <div className="action-menu">
            <button onClick={() => { setMenuOpen(false); onViewFeedback(card); }}><FileText size={15} /> {t("Geri bildirimler")}</button>
            <button onClick={() => { setMenuOpen(false); onEdit(card); }}><Settings size={15} /> {t("Kartı düzenle")}</button>
            <button className="menu-danger" onClick={() => { setMenuOpen(false); onDelete(card); }}><Trash2 size={15} /> {t("Kartı sil")}</button>
          </div>}
        </div>
      </div>
    </article>
  );
}

function OnboardingModal({ busy, error, onChoose, onSkip }) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section className="modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-heading">
          <p className="eyebrow">{t("HESABINIZI HAZIRLAYIN")}</p>
          <h2 id="onboarding-title">{t("Bilgi NFC'yi en çok nasıl kullanacaksınız?")}</h2>
          <p>{t("Bu, deneyiminizi kişiselleştirmemize yardımcı olur. İsterseniz daha sonra da yanıtlayabilirsiniz.")}</p>
        </div>
        <div className="onboarding-options">
          <button type="button" className="onboarding-option" disabled={busy} onClick={() => onChoose("personal_freelancer")}>
            <span className="choice-icon"><UserRound size={18} /></span>
            <strong>{t("Kişisel / Serbest çalışan")}</strong>
          </button>
          <button type="button" className="onboarding-option" disabled={busy} onClick={() => onChoose("business_enterprise")}>
            <span className="choice-icon"><Globe2 size={18} /></span>
            <strong>{t("İşletme / Kurumsal")}</strong>
          </button>
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button type="button" className="button button-secondary onboarding-skip" disabled={busy} onClick={onSkip}>
          {busy ? <LoaderCircle className="spin" size={16} /> : null}{t("Şimdilik geç")}
        </button>
      </section>
    </div>
  );
}

function GoogleConsentModal({ status, error, onRetry, onConfirm }) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);
  const busy = status === "saving";
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section className="modal google-consent-modal" role="dialog" aria-modal="true" aria-labelledby="google-consent-title">
        <div className="onboarding-heading">
          <p className="eyebrow">{t("HESABINIZI HAZIRLAYIN")}</p>
          <h2 id="google-consent-title">{t("Yasal koşulları onaylayın")}</h2>
          <p>{t("Hesabınızı kullanmadan önce Kullanım Koşulları ve Gizlilik Politikası'nı inceleyip onaylamanız gerekir.")}</p>
        </div>
        {status === "checking" ? (
          <p className="consent-checking"><LoaderCircle className="spin" size={18} /> {t("Onay durumunuz kontrol ediliyor…")}</p>
        ) : status === "error" ? (
          <>
            <div className="inline-error" role="alert">{error}</div>
            <button className="button button-primary button-wide" type="button" onClick={onRetry}>{t("Yeniden dene")}</button>
          </>
        ) : (
          <>
            <label className="check-row google-consent-check">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} />
              <span>{t("Şunları kabul ediyorum:")} <a href={legalLinks[0].href} target="_blank" rel="noreferrer">{t("Kullanım Koşulları")}</a> {t("ve")} <a href={legalLinks[1].href} target="_blank" rel="noreferrer">{t("Gizlilik Politikası")}</a>. {t("En az 18 yaşında olduğumu veya ülkemdeki yasal asgari yaş şartını karşıladığımı onaylıyorum.")} <b>*</b></span>
            </label>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <button className="button button-primary button-wide" type="button" disabled={!accepted || busy} onClick={onConfirm}>
              {busy ? <LoaderCircle className="spin" size={16} /> : null}{t("Kabul et ve devam et")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function App() {
  const { t, language } = useTranslation();
  const pathname = window.location.pathname;
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const publicMatch = normalizedPath.match(/^\/(c|p)\/([^/]+)$/);
  const legacyCardRoute = normalizedPath === "/informationpage";
  const legacyCardKey = legacyCardRoute
    ? new URLSearchParams(window.location.search).get("id") ||
      new URLSearchParams(window.location.search).get("token") ||
      new URLSearchParams(window.location.search).get("slug")
    : null;
  const slugMatch = normalizedPath.match(/^\/([^/]+)$/);
  const publicSlug = slugMatch && !reservedRoutes.has(decodeRouteSegment(slugMatch[1]).toLowerCase())
    ? decodeRouteSegment(slugMatch[1])
    : null;
  const legalRoute = legalRouteDocuments[normalizedPath] || legacyLegalRouteDocuments[normalizedPath];
  const legalRouteTarget = legalRoute
    ? getLegalRouteTarget(legalRoute[0], legalRoute[1])
    : null;
  const loginRoute = normalizedPath === "/login";
  const createRoute = normalizedPath === "/create";
  const dashboardRoute = /^\/dashboard(?:\/.*)?$/.test(normalizedPath);
  const settingsRoute = /^\/settings(?:\/.*)?$/.test(normalizedPath);
  const protectedRoute = createRoute || dashboardRoute || settingsRoute;
  const authRoute = protectedRoute || loginRoute;
  const cardKey = publicMatch
    ? decodeRouteSegment(publicMatch[2])
    : legacyCardKey || publicSlug;
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!authRoute || !supabaseConfigured);
  const [authNotice, setAuthNotice] = useState("");
  const [cards, setCards] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [profile, setProfile] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [googleConsentStatus, setGoogleConsentStatus] = useState("not-required");
  const [googleConsentError, setGoogleConsentError] = useState("");
  const [clients, setClients] = useState([]);
  const [abuseReports, setAbuseReports] = useState([]);
  const [section, setSection] = useState(settingsRoute ? "settings" : "overview");
  const [cardScope, setCardScope] = useState("all");
  const [feedbackCardId, setFeedbackCardId] = useState("");
  const [modalCard, setModalCard] = useState(undefined);
  const [startManagedCard, setStartManagedCard] = useState(false);
  const [deleteCardTarget, setDeleteCardTarget] = useState(null);
  const [deletingCard, setDeletingCard] = useState(false);
  const [reportContext, setReportContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("bilgi-theme") === "dark");
  function openReport(context = {}) {
    setReportContext({
      ...context,
      reportedUrl: context.reportedUrl || window.location.href,
    });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("bilgi-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!authRoute || !supabase) return undefined;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      if (data.session && !isVerifiedAuthSession(data.session)) {
        setSession(null);
        setGoogleConsentStatus("not-required");
        setAuthNotice(t("E-posta adresinizi doğrulamanız gerekiyor. Lütfen etkinleştirme bağlantısını kullanın."));
        void supabase.auth.signOut();
      } else {
        setSession(data.session);
        setGoogleConsentStatus(isGoogleAuthSession(data.session) ? "checking" : "not-required");
        if (data.session) setAuthNotice("");
      }
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession && !isVerifiedAuthSession(nextSession)) {
        setSession(null);
        setGoogleConsentStatus("not-required");
        setAuthNotice(t("E-posta adresinizi doğrulamanız gerekiyor. Lütfen etkinleştirme bağlantısını kullanın."));
        window.queueMicrotask(() => { void supabase.auth.signOut(); });
      } else {
        setSession(nextSession);
        setGoogleConsentStatus(isGoogleAuthSession(nextSession) ? "checking" : "not-required");
        if (nextSession) setAuthNotice("");
      }
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [authRoute, t]);

  useEffect(() => {
    if (session && createRoute) {
      setStartManagedCard(false);
      setModalCard(null);
    }
  }, [session, createRoute]);

  useEffect(() => {
    if (session && loginRoute) {
      window.history.replaceState({}, "", "/dashboard");
      setSection("overview");
    }
  }, [session, loginRoute]);

  useEffect(() => {
    if (!session || !supabase || !isGoogleAuthSession(session) || googleConsentStatus !== "checking") return undefined;
    let cancelled = false;
    async function checkGoogleConsent() {
      setGoogleConsentError("");
      const { data, error: consentError } = await supabase
        .from("consent_records")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (consentError) {
        setGoogleConsentError(consentError.message);
        setGoogleConsentStatus("error");
        return;
      }
      setGoogleConsentStatus(data ? "done" : "required");
    }
    checkGoogleConsent().catch((consentError) => {
      if (cancelled) return;
      setGoogleConsentError(consentError.message || t("Onay durumu kontrol edilemedi."));
      setGoogleConsentStatus("error");
    });
    return () => { cancelled = true; };
  }, [session, googleConsentStatus, t]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadData() {
    if (!supabase || !session) return;
    setLoading(true);
    setError("");
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,role,full_name,email,phone,marketing_opt_in,account_type,onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();
    setProfile(profileData || null);
    if (!profileError && profileData) {
      setOnboardingOpen(!profileData.onboarding_completed);
    }
    const role = profileData?.role || "user";
    const isAdmin = role === "admin" || role === "reseller";
    const [cardsResult, feedbackResult, feedbackCountResult, clientsResult, reportsResult] = await Promise.all([
      supabase.from("nfc_cards").select("*").order("created_at", { ascending: false }),
      supabase.from("card_feedbacks").select("id,card_id,customer_message,rating,created_at,customer_contact").order("created_at", { ascending: false }).limit(1000),
      supabase.from("card_feedbacks").select("id", { count: "exact", head: true }),
      isAdmin
        ? supabase.from("profiles").select("id,full_name,email,phone").eq("role", "user").order("full_name")
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase.from("abuse_reports").select("id,card_id,reported_url,reporter_email,reason_category,details,status,created_at").order("created_at", { ascending: false }).limit(250)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileError || !profileData) {
      setError(profileError
        ? `${t("Profil yüklenemedi: {error}", { error: profileError.message })}`
        : t("Kullanıcı profili bulunamadı. Lütfen veritabanı şemasını uygulayın."));
    }
    if (cardsResult.error) setError(`Kartlar yüklenemedi: ${cardsResult.error.message}`);
    else setCards(cardsResult.data || []);
    if (feedbackResult.error) {
      if (feedbackResult.error.code !== "42P01") {
        setError((previous) => [previous, `Geri bildirimler yüklenemedi: ${feedbackResult.error.message}`].filter(Boolean).join(" "));
      }
      setFeedback([]);
    } else setFeedback(feedbackResult.data || []);
    if (feedbackCountResult.error) {
      setError((previous) => [previous, `Geri bildirim sayısı alınamadı: ${feedbackCountResult.error.message}`].filter(Boolean).join(" "));
    } else setFeedbackTotal(feedbackCountResult.count || 0);
    if (clientsResult.error) {
      setError((previous) => [previous, t("Müşteri profilleri yüklenemedi: {error}", { error: clientsResult.error.message })].filter(Boolean).join(" "));
      setClients([]);
    } else setClients(clientsResult.data || []);
    if (reportsResult.error) {
      setError((previous) => [previous, t("Kötüye kullanım bildirimleri yüklenemedi: {error}", { error: reportsResult.error.message })].filter(Boolean).join(" "));
      setAbuseReports([]);
    } else setAbuseReports(reportsResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (protectedRoute && session && (!isGoogleAuthSession(session) || googleConsentStatus === "done")) {
      loadData();
    }
  }, [session, protectedRoute, googleConsentStatus]);

  async function acceptGoogleConsent() {
    if (!supabase || !session || !isGoogleAuthSession(session)) return;
    setGoogleConsentStatus("saving");
    setGoogleConsentError("");
    const acceptedAt = new Date().toISOString();
    try {
      const { error: consentError } = await supabase.from("consent_records").upsert({
        user_id: session.user.id,
        terms_accepted_at: acceptedAt,
        kvkk_consent_at: acceptedAt,
        age_confirmed_at: acceptedAt,
      }, { onConflict: "user_id" });
      if (consentError) throw consentError;
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          terms_accepted: true,
          kvkk_consent: true,
          age_confirmed: true,
          terms_accepted_at: acceptedAt,
          kvkk_consent_at: acceptedAt,
        },
      });
      if (metadataError) throw metadataError;
      setGoogleConsentStatus("done");
    } catch (consentError) {
      setGoogleConsentError(consentError.message || t("Yasal onayınız kaydedilemedi."));
      setGoogleConsentStatus("required");
    }
  }

  async function completeOnboarding(accountType) {
    if (!supabase || !session) return;
    setOnboardingBusy(true);
    setOnboardingError("");
    try {
      const metadata = { onboarding_completed: true };
      if (accountType) metadata.account_type = accountType;
      const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
      if (updateError) throw updateError;
      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id,role,full_name,email,phone,marketing_opt_in,account_type,onboarding_completed")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!updatedProfile) throw new Error(t("Onboarding tercihiniz kaydedilemedi."));
      setProfile(updatedProfile);
      setOnboardingOpen(false);
    } catch (onboardingSaveError) {
      setOnboardingError(onboardingSaveError.message || t("Onboarding tercihiniz kaydedilemedi."));
    } finally {
      setOnboardingBusy(false);
    }
  }

  function handleAuthenticated(nextSession) {
    setSession(nextSession);
    setGoogleConsentStatus(isGoogleAuthSession(nextSession) ? "checking" : "not-required");
    setAuthNotice("");
    if (loginRoute) {
      window.history.replaceState({}, "", "/dashboard");
      setSection("overview");
    }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setToast({ message: signOutError.message, bad: true });
  }

  async function deleteCard() {
    if (!deleteCardTarget) return;
    setDeletingCard(true);
    const card = deleteCardTarget;
    const { error: deleteError } = await supabase.from("nfc_cards").delete().eq("id", card.id);
    if (deleteError)     setToast({ message: t("Kart silinemedi: {error}", { error: deleteError.message }), bad: true });
    else {
      setDeleteCardTarget(null);
      setToast({ message: t("Kart silindi.") });
      await loadData();
    }

    async function toggleCardActive(card) {
      const nextActive = !card.is_active;
      const { error: updateError } = await supabase
        .from("nfc_cards")
        .update({ is_active: nextActive })
        .eq("id", card.id);
      if (updateError) {
        setToast({ message: t("Kart durumu güncellenemedi: {error}", { error: updateError.message }), bad: true });
        return;
      }
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, is_active: nextActive } : item));
      setToast({ message: nextActive ? t("Kart yeniden etkinleştirildi.") : t("Kart geçici olarak donduruldu.") });
    }

    async function updateReportStatus(report, status) {
      const { error: updateError } = await supabase
        .from("abuse_reports")
        .update({ status })
        .eq("id", report.id);
      if (updateError) {
        setToast({ message: t("Bildirim durumu güncellenemedi: {error}", { error: updateError.message }), bad: true });
        return;
      }
      setAbuseReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item));
    }
    setDeletingCard(false);
  }

  async function exportData() {
    const { data: profileData, error: profileError } = await supabase.auth.getUser();
    if (profileError) throw profileError;
    async function fetchAllRows(table, columns) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: queryError } = await supabase
          .from(table)
          .select(columns)
          .range(offset, offset + 999);
        if (queryError) throw queryError;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    }
    const [exportCards, exportFeedback, nfcTags, consents] = await Promise.all([
      fetchAllRows("nfc_cards", "*"),
      fetchAllRows("card_feedbacks", "*"),
      fetchAllRows("nfc_tags", "*"),
      fetchAllRows("consent_records", "*"),
    ]);
    const exportObject = {
      exported_at: new Date().toISOString(),
      profile: {
        id: profileData.user.id,
        email: profileData.user.email,
        phone: profileData.user.phone,
        user_metadata: profileData.user.user_metadata,
        created_at: profileData.user.created_at,
      },
      cards: exportCards,
      nfc_tags: nfcTags,
      feedback: exportFeedback,
      consent_records: consents,
    };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bilgi-veri-disa-aktarim-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setToast({ message: t("Verileriniz JSON olarak indirildi.") });
  }

  async function deleteAccount() {
    const accepted = window.confirm(t("Hesabınız, kartlarınız, etiketleriniz ve geri bildirimleriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"));
    if (!accepted) return;
    try {
      const response = await fetch(`${workerBase}/api/user/delete`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!response.ok) {
        let responseMessage = t("Hesap silinemedi. Lütfen tekrar deneyin.");
        try {
          responseMessage = (await response.json()).error || responseMessage;
        } catch {
          responseMessage = t("Hesap silinemedi. Lütfen tekrar deneyin.");
        }
        setToast({ message: responseMessage, bad: true });
        return;
      }
      await supabase.auth.signOut();
      setToast({ message: t("Hesabınız kalıcı olarak silindi.") });
    } catch (deleteError) {
      setToast({ message: deleteError.message || t("Hesap silinemedi. Lütfen tekrar deneyin."), bad: true });
    }
  }

  function goTo(nextSection) {
    setSection(nextSection);
    setMobileOpen(false);
    setError("");
  }

  if (legalRouteTarget) return <LegalRouteRedirect target={legalRouteTarget} />;
  if (normalizedPath === "/") return <>
    <PublicLanding onReport={openReport} />
    {reportContext && <AbuseReportModal context={reportContext} onClose={() => setReportContext(null)} />}
  </>;
  if (cardKey) return <>
    <PublicCard token={cardKey} onReport={openReport} />
    {reportContext && <AbuseReportModal context={reportContext} onClose={() => setReportContext(null)} />}
  </>;
  if (!authRoute) return <>
    <PublicNotFound onReport={openReport} />
    {reportContext && <AbuseReportModal context={reportContext} onClose={() => setReportContext(null)} />}
  </>;
  if (!authReady) return <div className="app-loading"><LoaderCircle className="spin" /></div>;
  if (!session) return <>
    <AuthScreen onAuthenticated={handleAuthenticated} onReport={openReport} initialNotice={authNotice} />
    {reportContext && <AbuseReportModal context={reportContext} onClose={() => setReportContext(null)} />}
  </>;
  if (isGoogleAuthSession(session) && googleConsentStatus !== "done") {
    if (googleConsentStatus === "checking" || googleConsentStatus === "saving") {
      return <div className="app-loading"><LoaderCircle className="spin" /></div>;
    }
    return <GoogleConsentModal
      status={googleConsentStatus}
      error={googleConsentError}
      onRetry={() => setGoogleConsentStatus("checking")}
      onConfirm={acceptGoogleConsent}
    />;
  }

  const user = session.user;
  const isAdmin = profile?.role === "admin" || profile?.role === "reseller";
  const pendingReports = abuseReports.filter((report) => report.status === "pending").length;
  const visibleCards = cards.filter((card) => !isAdmin ||
    cardScope === "all" ||
    (cardScope === "managed" ? card.managed_by_admin : card.user_id === user.id && !card.managed_by_admin));
  const filteredCards = visibleCards.filter((card) => `${card.title} ${t(cardTypeLabel[card.type] || "Dijital kart")}`.toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language)));
  const heading = {
    overview: [t("Genel Bakış"), t("Dijital varlıklarınızın bugünkü özeti.")],
    cards: [t("Kartlarım"), t("Dijital kartlarınızı ve NFC bağlantılarınızı yönetin.")],
    feedback: [t("Geri bildirimler"), t("Kartlarınız üzerinden gelen müşteri yorumları.")],
    settings: [t("Hesap ayarları"), t("Kişisel verilerinizi ve hesabınızı yönetin.")],
    abuse: [t("Kötüye kullanım bildirimleri"), t("Bildirilen bağlantıları inceleyin ve gerekirse kartları geçici olarak devre dışı bırakın.")],
  }[section];

  return (
    <div className="dashboard-shell">
      <Sidebar section={section} onSection={goTo} onSignOut={signOut} user={{ ...user, role: profile?.role }} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} dark={dark} onToggleTheme={() => setDark(!dark)} isAdmin={isAdmin} pendingReports={pendingReports} />
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label={t("Menüyü aç")} onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>{t("Çalışma alanı")}</span><span>/</span><strong>{heading[0]}</strong></div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <a href="mailto:destek@openstacktool.com" className="topbar-help"><CircleHelp size={17} /> {t("Yardım")}</a>
            <span className="topbar-divider" />
            <button className="notification-button icon-button" aria-label={t("Bildirimler")} onClick={() => isAdmin ? goTo("abuse") : setToast({ message: t("Yeni bildiriminiz yok.") })}><Bell size={18} />{isAdmin && pendingReports > 0 && <i />}</button>
            <span className="top-avatar">{(user.user_metadata?.full_name || user.email || "B").slice(0, 1).toLocaleUpperCase("tr")}</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">{new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-US", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>{heading[0]}</h1><p>{heading[1]}</p></div>
            {section !== "settings" && section !== "feedback" && section !== "abuse" && <div className="heading-actions">
              {isAdmin && <button className="button button-secondary" onClick={() => { setStartManagedCard(true); setModalCard(null); }}><Plus size={17} /> {t("Müşteri için kart oluştur")}</button>}
              <button className="button button-primary" onClick={() => { setStartManagedCard(false); setModalCard(null); }}><Plus size={17} /> {t("Yeni kart oluştur")}</button>
            </div>}
          </div>
          {error && <div className="inline-error dashboard-error" role="alert">{t(error)}<button onClick={() => setError("")}><X size={15} /></button></div>}
          {loading ? <div className="content-loading"><LoaderCircle className="spin" /> {t("Yükleniyor…")}</div> : (
            <>
              {section === "overview" && (
                <>
                  <section className="stats-grid" aria-label={t("Hesap özeti")}>
                    <article className="stat-card"><div className="stat-top"><span>{t("Toplam kart")}</span><span className="stat-icon stat-purple"><Smartphone size={17} /></span></div><strong>{cards.length.toString().padStart(2, "0")}</strong><p><span className="stat-dot dot-purple" /> {t("Tüm dijital kartlarınız")}</p></article>
                    <article className="stat-card"><div className="stat-top"><span>{t("Herkese açık")}</span><span className="stat-icon stat-green"><Globe2 size={17} /></span></div><strong>{cards.filter((card) => card.access_mode === "public").length.toString().padStart(2, "0")}</strong><p><span className="stat-dot dot-green" /> {t("Herkese açık kartlar")}</p></article>
                    <article className="stat-card"><div className="stat-top"><span>{t("Gizli bağlantı")}</span><span className="stat-icon stat-orange"><ShieldCheck size={17} /></span></div><strong>{cards.filter((card) => card.access_mode === "private").length.toString().padStart(2, "0")}</strong><p><span className="stat-dot dot-orange" /> {t("Özel bağlantılı kartlar")}</p></article>
                    <article className="stat-card"><div className="stat-top"><span>{t("Müşteri geri bildirimi")}</span><span className="stat-icon stat-green"><FileText size={17} /></span></div><strong>{feedbackTotal.toString().padStart(2, "0")}</strong><p><span className="stat-dot dot-green" /> {t("Toplam alınan yanıt")}</p></article>
                  </section>
                  <section className="panel cards-panel">
                    <div className="panel-heading"><div><h2>{t("Son kartlarınız")}</h2><p>{t("Tüm dijital kartlarınızı tek yerden yönetin.")}</p></div><button className="text-button" onClick={() => goTo("cards")}>{t("Tümünü gör")} <ArrowUpRight size={14} /></button></div>
                    {cards.length ? cards.slice(0, 4).map((card) => <CardRow key={card.id} card={card} onEdit={setModalCard} onDelete={setDeleteCardTarget} onViewFeedback={(selectedCard) => { setFeedbackCardId(selectedCard.id); goTo("feedback"); }} onNotify={(message, bad) => setToast({ message, bad })} isAdmin={isAdmin} onToggleActive={toggleCardActive} />) : <EmptyCards onCreate={() => { setStartManagedCard(false); setModalCard(null); }} />}
                  </section>
                  <section className="trust-banner"><span className="trust-icon"><ShieldCheck size={21} /></span><div><strong>{t("Paylaştığınız her bağlantı kontrol altında")}</strong><p>{t("Harici bağlantılar kartınıza eklenmeden önce güvenlik kontrolünden geçirilir.")}</p></div><span className="trust-check"><Check size={16} /></span></section>
                </>
              )}
              {section === "cards" && (
                <section className="panel cards-panel">
                  <div className="panel-heading cards-toolbar">
                    <div><h2>{t("Tüm kartlar")} <span className="count-pill">{visibleCards.length}</span></h2><p>{t("Bağlantılarınızı görüntüleyin, kopyalayın veya güncelleyin.")}</p></div>
                    <div className="cards-toolbar-controls">
                      {isAdmin && <div className="card-scope-filter" role="group" aria-label={t("Kart kapsamı")}>
                        <button className={cardScope === "all" ? "active" : ""} onClick={() => setCardScope("all")}>{t("Tüm kartlar")}</button>
                        <button className={cardScope === "personal" ? "active" : ""} onClick={() => setCardScope("personal")}>{t("Kişisel kartlar")}</button>
                        <button className={cardScope === "managed" ? "active" : ""} onClick={() => setCardScope("managed")}>{t("Müşteri kartları")}</button>
                      </div>}
                      <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Kartlarda ara...")} /></label>
                    </div>
                  </div>
                  {filteredCards.length ? filteredCards.map((card) => <CardRow key={card.id} card={card} onEdit={setModalCard} onDelete={setDeleteCardTarget} onViewFeedback={(selectedCard) => { setFeedbackCardId(selectedCard.id); goTo("feedback"); }} onNotify={(message, bad) => setToast({ message, bad })} isAdmin={isAdmin} onToggleActive={toggleCardActive} />) : <EmptyCards onCreate={() => { setStartManagedCard(false); setModalCard(null); }} />}
                </section>
              )}
              {section === "feedback" && (
                <section className="panel feedback-panel">
                  <div className="panel-heading"><div><h2>{feedbackCardId ? `${cards.find((card) => card.id === feedbackCardId)?.title || t("Kart")} ${t("Geri bildirimleri")}` : t("Müşteri yanıtları")}</h2><p>{t("Google yorum kartlarınızdan gelen geri bildirimler.")}</p></div><div className="feedback-heading-actions">{feedbackCardId && <button className="text-button" onClick={() => setFeedbackCardId("")}>{t("Tüm kartlar")}</button>}<span className="count-pill">{(feedbackCardId ? feedback.filter((item) => item.card_id === feedbackCardId) : feedback).length} {t("yanıt")}</span></div></div>
                  {(feedbackCardId ? feedback.filter((item) => item.card_id === feedbackCardId) : feedback).length ? <div className="feedback-list">{(feedbackCardId ? feedback.filter((item) => item.card_id === feedbackCardId) : feedback).map((item) => {
                    const card = cards.find((entry) => entry.id === item.card_id);
                    return <article className="feedback-row" key={item.id}><div className="feedback-rating">{item.rating ? `${item.rating} ★` : <FileText size={17} />}</div><div className="feedback-copy"><div><strong>{card?.title || t("Silinmiş kart")}</strong><time>{new Date(item.created_at).toLocaleDateString(language === "tr" ? "tr-TR" : "en-US")}</time></div><p>{item.customer_message || t("Yorum metni belirtilmedi.")}</p>{item.customer_contact && <small>{item.customer_contact}</small>}</div></article>;
                  })}</div> :                   <div className="empty-state"><div className="empty-icon"><FileText size={21} /></div><h3>{t("Henüz geri bildirim yok")}</h3><p>{t("Müşterileriniz kartlarınız üzerinden yanıt verdiğinde burada görebilirsiniz.")}</p></div>}
                </section>
              )}
              {section === "abuse" && isAdmin && (
                <section className="panel abuse-panel">
                  <div className="panel-heading">
                    <div><h2>{t("Kötüye kullanım bildirimleri")} <span className="count-pill">{pendingReports}</span></h2><p>{t("Bildirilen bağlantıları inceleyin ve gerekirse kartları geçici olarak devre dışı bırakın.")}</p></div>
                  </div>
                  {abuseReports.length ? <div className="abuse-report-list">
                    {abuseReports.map((report) => {
                      const linkedCard = cards.find((card) => card.id === report.card_id);
                      return <article className="abuse-report-row" key={report.id}>
                        <div className="abuse-report-heading">
                          <div><span className={`report-status status-${report.status}`}>{t(report.status === "pending" ? "Bekliyor" : report.status === "investigating" ? "İnceleniyor" : report.status === "resolved" ? "Çözüldü" : "Reddedildi")}</span><strong>{t(report.reason_category === "phishing" ? "Kimlik avı" : report.reason_category === "malware" ? "Kötü amaçlı yazılım" : report.reason_category === "defamation" ? "İftira / hakaret" : report.reason_category === "copyright" ? "Telif hakkı ihlali" : "Diğer")}</strong></div>
                          <time>{new Date(report.created_at).toLocaleString(language === "tr" ? "tr-TR" : "en-US")}</time>
                        </div>
                        <p>{report.details}</p>
                        <dl><div><dt>{t("Bildirilen URL")}</dt><dd><code>{report.reported_url}</code></dd></div><div><dt>{t("E-posta adresiniz")}</dt><dd>{report.reporter_email}</dd></div></dl>
                        <div className="abuse-report-actions">
                          {linkedCard && <button className="button button-secondary" onClick={() => toggleCardActive(linkedCard)}><ShieldCheck size={15} /> {linkedCard.is_active ? t("Kartı dondur") : t("Kartı etkinleştir")} · {linkedCard.title}</button>}
                          {report.status === "pending" && <button className="button button-secondary" onClick={() => updateReportStatus(report, "investigating")}>{t("İncelemeye al")}</button>}
                          {report.status !== "resolved" && report.status !== "dismissed" && <button className="button button-primary" onClick={() => updateReportStatus(report, "resolved")}>{t("Çözüldü olarak işaretle")}</button>}
                        </div>
                      </article>;
                    })}
                  </div> : <div className="empty-state"><div className="empty-icon"><ShieldCheck size={21} /></div><h3>{t("Henüz kötüye kullanım bildirimi yok.")}</h3><p>{t("Yeni bildirimler burada görüntülenecektir.")}</p></div>}
                </section>
              )}
              {section === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel"><div className="settings-title"><span className="settings-icon"><UserRound size={18} /></span><div><h2>{t("Profil bilgileri")}</h2><p>{t("Hesabınızla ilişkili bilgiler.")}</p></div></div><div className="settings-detail"><span>{t("Ad soyad")}</span><strong>{user.user_metadata?.full_name || t("Belirtilmedi")}</strong></div><div className="settings-detail"><span>{t("E-posta")}</span><strong>{user.email || t("Belirtilmedi")}</strong></div><div className="settings-detail"><span>{t("Telefon")}</span><strong>{user.phone || t("Belirtilmedi")}</strong></div><div className="settings-detail"><span>{t("Rol")}</span><strong>{isAdmin ? t(profile.role === "admin" ? "Yönetici" : "Bayi") : t("Doğrulanmış kullanıcı")}</strong></div><div className="settings-detail"><span>{t("Hesap oluşturma")}</span><strong>{new Date(user.created_at).toLocaleDateString(language === "tr" ? "tr-TR" : "en-US")}</strong></div></section>
                  <section className="panel settings-panel"><div className="settings-title"><span className="settings-icon"><ArrowDownToLine size={18} /></span><div><h2>{t("Verileriniz")}</h2><p>{t("KVKK ve GDPR kapsamındaki veri haklarınız.")}</p></div></div><p className="settings-description">{t("Profilinizi, kartlarınızı ve geri bildirimlerinizi makine tarafından okunabilir JSON biçiminde indirin.")}</p><button className="button button-secondary" onClick={() => exportData().catch((exportError) => setToast({ message: exportError.message, bad: true }))}><ArrowDownToLine size={16} /> {t("Verilerimi dışa aktar")}</button></section>
                  <section className="panel settings-panel danger-panel"><div className="settings-title"><span className="settings-icon danger-settings-icon"><Trash2 size={18} /></span><div><h2>{t("Kullanıcı Hesabını Sil")}</h2><p>{t("Bu işlem kalıcıdır ve geri alınamaz.")}</p></div></div><p className="settings-description">{t("Hesabınızı sildiğinizde profiliniz, dijital kartlarınız, NFC bağlantılarınız ve ilişkili geri bildirim kayıtlarınız da silinir.")}</p><button className="button button-danger" onClick={deleteAccount}><Trash2 size={15} /> {t("Kullanıcı Hesabını Sil")}</button></section>
                </div>
              )}
            </>
          )}
        </div>
        <Footer onReport={openReport} />
      </main>
      {modalCard !== undefined && <CardModal card={modalCard} isAdmin={isAdmin} user={user} clients={clients} startManaged={startManagedCard} onClose={() => setModalCard(undefined)} onSaved={(saved) => {
        setCards((items) => modalCard ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
        setModalCard(undefined);
        setStartManagedCard(false);
        setToast({ message: t(modalCard ? "Kart bilgileriniz güncellendi." : "Yeni kartınız oluşturuldu.") });
      }} />}
      {deleteCardTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingCard) setDeleteCardTarget(null); }}>
        <section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-card-title">
          <div className="delete-modal-icon"><Trash2 size={20} /></div>
          <h2 id="delete-card-title">{t("Kart kalıcı olarak silinsin mi?")}</h2>
          <p><strong>{deleteCardTarget.title}</strong> {t("kartı, ilişkili geri bildirimler ve etiketlerle birlikte silinecek. Bu işlem geri alınamaz.")}</p>
          <div className="modal-actions"><button type="button" className="button button-secondary" disabled={deletingCard} onClick={() => setDeleteCardTarget(null)}>{t("Vazgeç")}</button><button type="button" className="button button-danger" disabled={deletingCard} onClick={deleteCard}>{deletingCard ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={15} />} {t("Kartı sil")}</button></div>
        </section>
      </div>}
      {onboardingOpen && <OnboardingModal
        busy={onboardingBusy}
        error={onboardingError}
        onChoose={(accountType) => completeOnboarding(accountType)}
        onSkip={() => completeOnboarding(null)}
      />}
      {reportContext && <AbuseReportModal context={reportContext} onClose={() => setReportContext(null)} />}
      {toast && <div className={`toast ${toast.bad ? "toast-bad" : ""}`} role="status">{toast.bad ? <X size={17} /> : <Check size={17} />}{t(toast.message)}<button onClick={() => setToast(null)} aria-label={t("Bildirimi kapat")}><X size={15} /></button></div>}
    </div>
  );
}

function EmptyCards({ onCreate }) {
  const { t } = useTranslation();
  return <div className="empty-state"><div className="empty-icon"><Link2 size={21} /></div><h3>{t("İlk kartınızı oluşturun")}</h3><p>{t("İşletmenizin dijital profilini birkaç adımda hazırlayın.")}</p><button className="button button-primary" onClick={onCreate}><Plus size={16} /> {t("Kart oluştur")}</button></div>;
}

export default App;
