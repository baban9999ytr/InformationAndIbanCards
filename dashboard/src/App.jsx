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
  MessageCircle,
  Mail,
  MapPin,
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
  Phone,
  Users,
  X,
} from "lucide-react";
import { scanExternalUrl, validateHttpsUrl } from "./security.js";
import { signInWithGoogle } from "./auth.js";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { LanguageSwitcher, useTranslation } from "./i18n.jsx";
import { invalidateCachedQueries, queryCached } from "./queryCache.js";
import {
  paletteContrastIssues,
  saveCustomPalette,
  validatePaletteTokens,
} from "./paletteApi.js";
import {
  CARD_BLOCK_TYPES,
  createCardBlock,
  hydrateCardFromBlocks,
  isValidIban,
  isSupportedCardBlock,
  legacyFieldsForCardSave,
  makeCardBlocks,
  normalizeBlockType,
  serializeCardBlocks,
} from "./cardBlocks.js";
import {
  demoCard,
  resolvePrimaryAction,
  resolvePresentationMode,
  validatePrimaryAction,
} from "./cardExperience.js";

const initialCard = {
  title: "",
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
  palette_id: null,
  nfc_active: false,
  is_active: true,
  managed_by_admin: false,
  client_notes: "",
};
const cardBlockLabels = {
  profile: "Profil",
  payment_or_iban: "IBAN / ödeme",
  google_review: "Google yorum",
  contact: "İletişim",
  social: "Sosyal bağlantılar",
  custom_button: "Özel buton",
  custom_links: "Ek bağlantılar",
  text_or_note: "Metin / not",
};
const palettePresets = {
  payment_or_iban: {
    name: "IBAN / ödeme",
    tokens: {
      background: "#0F172A",
      surface: "#1E293B",
      text: "#F8FAFC",
      primary: "#38BDF8",
      accent: "#22C55E",
      muted: "#94A3B8",
      button_text: "#0F172A",
    },
  },
  sahibinden: {
    name: "Sahibinden",
    tokens: {
      background: "#F7F7F7",
      surface: "#FFFFFF",
      text: "#1F2937",
      primary: "#F58220",
      accent: "#111827",
      muted: "#6B7280",
      button_text: "#FFFFFF",
    },
  },
  instagram: {
    name: "Instagram",
    tokens: {
      background: "#1F1028",
      surface: "#321743",
      text: "#FFF7FC",
      primary: "#E1306C",
      accent: "#FCAF45",
      muted: "#D8B4FE",
      button_text: "#FFFFFF",
    },
  },
  linkedin: {
    name: "LinkedIn",
    tokens: {
      background: "#0B1F33",
      surface: "#123454",
      text: "#F8FAFC",
      primary: "#0A66C2",
      accent: "#70B5F9",
      muted: "#B8C7D9",
      button_text: "#FFFFFF",
    },
  },
};
const isAdminProfile = (profile) =>
  profile?.role === "admin" ||
  profile?.role === "reseller" ||
  profile?.is_super_user === true;
const isSuperAdminProfile = (profile) =>
  profile?.role === "admin" || profile?.is_super_user === true;
function cardPaletteStyle(palette) {
  const tokens =
    palette?.tokens && typeof palette.tokens === "object"
      ? palette.tokens
      : palette && typeof palette === "object"
        ? palette
        : {};
  const validColor = (value) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : undefined;
  return {
    "--bg-color": validColor(tokens.background),
    "--surface-color": validColor(tokens.surface),
    "--text-color": validColor(tokens.text),
    "--primary-color": validColor(tokens.primary),
    "--accent-color": validColor(tokens.accent),
    "--muted-color": validColor(tokens.muted),
    "--button-text-color": validColor(tokens.button_text),
    "--page": validColor(tokens.background),
    "--surface": validColor(tokens.surface),
    "--text": validColor(tokens.text),
    "--muted": validColor(tokens.muted),
    "--purple": validColor(tokens.primary),
    "--green": validColor(tokens.accent),
    "--button-text": validColor(tokens.button_text),
    "--surface-soft": validColor(tokens.surface),
  };
}
function paletteTokensStyle(tokens) {
  try {
    const valid = validatePaletteTokens(tokens);
    return {
      "--bg-color": valid.background,
      "--surface-color": valid.surface,
      "--text-color": valid.text,
      "--primary-color": valid.primary,
      "--muted-color": valid.muted,
      "--page": valid.background,
      "--surface": valid.surface,
      "--text": valid.text,
      "--muted": valid.muted,
      "--purple": valid.primary,
      "--green": valid.accent,
      "--surface-soft": valid.surface,
      "--border": valid.muted,
      "--border-strong": valid.primary,
    };
  } catch {
    return {};
  }
}
function cardBlockVisibility(card, type) {
  const block = card?.blocks?.find(
    (item) => normalizeBlockType(item?.type) === normalizeBlockType(type),
  );
  return !block || block.visible !== false;
}
function cardBlockOrder(card, type, fallback) {
  const block = card?.blocks?.find(
    (item) => normalizeBlockType(item?.type) === normalizeBlockType(type),
  );
  return Number.isFinite(block?.order) ? block.order : fallback;
}
function cardBlockPreviewText(block) {
  const data = block.data || {};
  switch (block.type) {
    case "profile":
      return [data.name, data.title, data.company].filter(Boolean).join(" · ");
    case "google_review":
      return data.business_name || data.url || "";
    case "payment_or_iban":
      return [data.recipient_name, data.bank_name, data.iban]
        .filter(Boolean)
        .join(" · ");
    case "contact":
      return [data.phone, data.email, data.whatsapp]
        .filter(Boolean)
        .join(" · ");
    case "social":
    case "custom_links":
      return (data.links || [])
        .map((link) => link.label)
        .filter(Boolean)
        .join(", ");
    case "custom_button":
      return data.button_text || data.title || data.url || "";
    case "text_or_note":
      return data.text || data.title || "";
    default:
      return "";
  }
}
const appOrigin = (
  import.meta.env.VITE_APP_ORIGIN || "https://bilgi.openstacktool.com"
).replace(/\/$/, "");
const workerBase = (import.meta.env.VITE_WORKER_URL || appOrigin).replace(
  /\/$/,
  "",
);
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
  `${appOrigin}/legal.html?document=${document}&lang=${language}`;
const legalLinksByLanguage = {
  tr: [
    { label: "Kullanım Koşulları", href: `${appOrigin}/tr/kullanim-kosullari` },
    {
      label: "Gizlilik Politikası",
      href: `${appOrigin}/tr/gizlilik-politikasi`,
    },
    { label: "KVKK Aydınlatma Metni", href: `${appOrigin}/tr/kvkk` },
    { label: "Çerez Politikası", href: `${appOrigin}/tr/cerez-politikasi` },
    { label: "İletişim", href: `${appOrigin}/tr/iletisim` },
  ],
  en: [
    { label: "Terms of Service", href: `${appOrigin}/en/terms-of-service` },
    { label: "Privacy Policy", href: `${appOrigin}/en/privacy-policy` },
    { label: "GDPR Notice", href: `${appOrigin}/en/gdpr` },
    { label: "Cookie Policy", href: `${appOrigin}/en/cookie-policy` },
    { label: "Contact", href: `${appOrigin}/en/contact` },
  ],
};
const reservedRoutes = new Set([
  "c",
  "p",
  "dashboard",
  "admin",
  "create",
  "settings",
  "login",
  "informationpage",
  "terms-of-service",
  "privacy-policy",
  "gdpr-kvkk",
  "privacy-notice",
  "cookie-policy",
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
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.73 6C44.43 38.02 46.98 31.8 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
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

function sanitizeIban(value) {
  return String(value || "")
    .trim()
    .split(":", 1)[0]
    .replace(/[^a-z\d]/gi, "")
    .toUpperCase();
}

function formatIban(value) {
  return (
    sanitizeIban(value)
      .match(/.{1,4}/g)
      ?.join(" ") || ""
  );
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
      <span>
        © {new Date().getFullYear()} Bilgi · {t("Güvenli dijital bağlantılar.")}
      </span>
      <nav aria-label={t("Yasal bağlantılar")}>
        <a href={mainSiteUrl} target="_blank" rel="noopener noreferrer">
          {t("Ana site")}
        </a>
        {legalLinks.map((link) => (
          <a
            href={link.href}
            key={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(link.label)}
          </a>
        ))}
        <button className="footer-report" onClick={onReport}>
          {t("Kötüye kullanım bildirimi")}
        </button>
      </nav>
    </footer>
  );
}

function AbuseReportModal({ context, onClose }) {
  const { t } = useTranslation();
  const [reportedUrl, setReportedUrl] = useState(
    context?.reportedUrl || window.location.href,
  );
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
      setError(
        t(
          "Supabase ayarları bulunamadı. Uygulamayı başlatmak için ortam değişkenlerini yapılandırın.",
        ),
      );
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
      setError(
        submitError.message ||
          t("Bildirim gönderilemedi. Lütfen tekrar deneyin."),
      );
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
    <div
      className="modal-backdrop report-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abuse-report-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{t("İnceleme ekibine güvenli bildirim")}</p>
            <h2 id="abuse-report-title">{t("Kötüye kullanım bildirimi")}</h2>
          </div>
          <IconButton label={t("Raporu kapat")} onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {submitted ? (
          <div className="report-success">
            <span className="settings-icon">
              <ShieldCheck size={19} />
            </span>
            <h3>
              {t("Bildiriminiz alındı. İnceleme ekibimiz değerlendirecektir.")}
            </h3>
            <button className="button button-primary" onClick={onClose}>
              {t("Bildirimi kapat")}
            </button>
          </div>
        ) : (
          <form className="report-form" onSubmit={submit}>
            <p>{t("Kart veya bağlantı hakkında bildirim gönderin.")}</p>
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <TextField
              label={t("Bildirilen URL")}
              type="url"
              value={reportedUrl}
              onChange={(event) => setReportedUrl(event.target.value)}
              required
            />
            <TextField
              label={t("E-posta adresiniz")}
              type="email"
              value={reporterEmail}
              onChange={(event) => setReporterEmail(event.target.value)}
              required
            />
            <label className="field">
              <span>{t("Bildirim nedeni")} *</span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              >
                <option value="">{t("Neden seçin")}</option>
                {reasons.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("Açıklama")} *</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={5000}
                minLength={10}
                required
                placeholder={t("En fazla 5000 karakter")}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={onClose}
              >
                {t("Vazgeç")}
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : null}
                {busy ? t("İşleniyor…") : t("Bildirimi gönder")}
              </button>
            </div>
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
        <a className="brand public-brand" href="/">
          <span className="brand-symbol">b.</span>
          <span>bilgi</span>
        </a>
        <LanguageSwitcher />
      </header>
      <article className="public-card landing-public-card">
        <p className="eyebrow">{t("Güvenli dijital bağlantılar.")}</p>
        <h1>InformationAndIbanCards</h1>
        <p className="landing-description">
          {t(
            "Share account details or collect customer feedback through a simple NFC or web link.",
          )}
        </p>
        <div className="landing-actions">
          <a className="button button-primary button-wide" href="/login">
            {t("Giriş Yap / Dashboard")}
          </a>
          <a className="button button-secondary button-wide" href="/create">
            {t("NFC Kart Oluştur")}
          </a>
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
        <a className="brand public-brand" href="/">
          <span className="brand-symbol">b.</span>
          <span>bilgi</span>
        </a>
        <LanguageSwitcher />
      </header>
      <article className="public-card not-found-card">
        <div className="empty-icon">
          <Link2 />
        </div>
        <h1>{t("Kart bulunamadı")}</h1>
        <p>
          {message || t("Bu bağlantı geçersiz veya artık erişilebilir değil.")}
        </p>
        <a className="button button-primary" href="/">
          {t("Ana sayfaya dön")}
        </a>
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
      <div className="empty-icon">
        <FileText size={21} />
      </div>
      <h2>{t("E-postanızı doğrulayın")}</h2>
      <p>
        {t("Etkinleştirme bağlantısını e-posta adresinize gönderdik:")}{" "}
        <strong>{email}</strong>
      </p>
      <p>{t("Hesabınıza erişmek için e-postanızdaki bağlantıyı açın.")}</p>
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={onResend}
      >
        {busy ? <LoaderCircle className="spin" size={15} /> : null}
        {t("Doğrulama e-postasını yeniden gönder")}
      </button>
    </section>
  );
}

function AuthScreen({ onAuthenticated, onReport, initialNotice = "" }) {
  const { t, language } = useTranslation();
  const legalLinks = legalLinksByLanguage[language] || legalLinksByLanguage.en;
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
  const validPassword =
    password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

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
      setError(
        t("Kayıt için adınızı, güçlü bir şifreyi ve zorunlu onayı tamamlayın."),
      );
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
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({
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
          <div className="eyebrow">
            <span className="live-dot" /> NFC & DİJİTAL KART YÖNETİMİ
          </div>
          <h1>
            İyi bağlantılar,
            <br />
            <span>iyi izlenimler</span> bırakır.
          </h1>
          <p>
            İşletmenizin dijital kartlarını tek bir yerden oluşturun, paylaşın
            ve yönetin.
          </p>
          <div className="story-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-card">
              <span className="art-chip">
                <Smartphone size={19} />
              </span>
              <span className="art-brand">
                bilgi<span>.</span>
              </span>
              <span className="art-lines">
                <i />
                <i />
                <i />
              </span>
              <span className="art-wave">)))</span>
            </div>
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">✦</span>
          </div>
        </div>
        <div className="story-bottom">
          <ShieldCheck size={16} /> Verileriniz güvenli ve size aittir.
        </div>
      </section>
      <section className="auth-side">
        <div className="auth-side-top">
          <LanguageSwitcher />
          <span>{t("Yeni misiniz?")}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setTab("email");
              setVerificationEmail("");
              setError("");
              setNotice("");
              setTerms(false);
              setMarketingOptIn(false);
            }}
          >
            {mode === "login" ? t("Hesap oluştur") : t("Giriş yap")}
          </button>
        </div>
        <div className="auth-form-wrap">
          <div className="mobile-brand brand">
            <span className="brand-symbol">b.</span>
            <span>bilgi</span>
          </div>
          <div className="form-intro">
            <p className="eyebrow">{t("HESABINIZA ERİŞİN")}</p>
            <h2>
              {mode === "login"
                ? t("Tekrar hoş geldiniz")
                : t("Aramıza katılın")}
            </h2>
            <p>{t("Devam etmek için bilgilerinizi girin.")}</p>
          </div>
          {mode === "login" && (
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Giriş yöntemi"
            >
              <button
                className={tab === "email" ? "active" : ""}
                type="button"
                onClick={() => {
                  setTab("email");
                  setTerms(false);
                  setOtpSent(false);
                }}
                role="tab"
              >
                {t("E-posta")}
              </button>
              <button
                className={tab === "phone" ? "active" : ""}
                type="button"
                onClick={() => {
                  setTab("phone");
                  setTerms(false);
                  setOtpSent(false);
                }}
                role="tab"
              >
                {t("Telefon ile giriş")}
              </button>
            </div>
          )}
          {!supabaseConfigured && (
            <div className="inline-warning">
              {t(
                "Supabase ayarları bulunamadı. Uygulamayı başlatmak için ortam değişkenlerini yapılandırın.",
              )}
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="inline-success" role="status">
              {notice}
            </div>
          )}
          {verificationEmail ? (
            <EmailVerificationNotice
              email={verificationEmail}
              onResend={resendVerification}
              busy={resendingVerification}
            />
          ) : tab === "email" ? (
            <form className="stack-form" onSubmit={submitEmail}>
              {mode === "register" && (
                <label>
                  {t("Ad soyad")}
                  <input
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    placeholder={t("Adınız Soyadınız")}
                  />
                </label>
              )}
              <label>
                {t("E-posta adresi")}
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={(event) => setEmail(event.target.value.trim())}
                  required
                  placeholder="name@business.com"
                />
              </label>
              <label>
                {t("Şifre")}
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder={t(
                    mode === "login"
                      ? "Şifreniz"
                      : "En az 8 karakter, harf ve rakam",
                  )}
                />
              </label>
              {mode === "register" && (
                <p className="helper-copy">
                  {t(
                    "Şifreniz en az 8 karakter olmalı ve en az bir harf ile bir rakam içermelidir.",
                  )}
                </p>
              )}
              {mode === "register" && (
                <div className="consent-fields">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={terms}
                      onChange={(event) => setTerms(event.target.checked)}
                    />
                    <span>
                      {t("Şunları kabul ediyorum:")}{" "}
                      <a
                        href={legalLinks[0].href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("Kullanım Koşulları")}
                      </a>{" "}
                      {t("ve")}{" "}
                      <a
                        href={legalLinks[1].href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("Gizlilik Politikası")}
                      </a>
                      .{" "}
                      {t(
                        "En az 18 yaşında olduğumu veya ülkemdeki yasal asgari yaş şartını karşıladığımı onaylıyorum.",
                      )}{" "}
                      <b>*</b>
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(event) =>
                        setMarketingOptIn(event.target.checked)
                      }
                    />
                    <span>
                      {t(
                        "Ürün güncellemelerini, ipuçlarını ve tanıtım haberlerini e-posta ile almak istiyorum.",
                      )}
                    </span>
                  </label>
                </div>
              )}
              <button
                className="button button-primary button-wide"
                disabled={
                  busy ||
                  !supabaseConfigured ||
                  (mode === "register" &&
                    (!terms || !validPassword || !fullName.trim()))
                }
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : null}
                {mode === "login" ? t("Giriş yap") : t("Hesabımı oluştur")}
              </button>
              <button
                className="button google-auth-button button-wide"
                type="button"
                disabled={oauthBusy || !supabaseConfigured}
                onClick={continueWithGoogle}
              >
                {oauthBusy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <GoogleIcon />
                )}
                {t("Google ile devam et")}
              </button>
            </form>
          ) : (
            <form className="stack-form" onSubmit={requestOtp}>
              <label>
                {t("Telefon numarası")}
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(normalizePhone(event.target.value))
                  }
                  required
                  placeholder="905551234567"
                />
              </label>
              {otpSent && (
                <label>
                  {t("SMS doğrulama kodu")}
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    required
                    placeholder={t("6 haneli kod")}
                  />
                </label>
              )}
              <p className="helper-copy">
                {t(
                  "SMS ile giriş için numaranızı ülke koduyla birlikte yazın.",
                )}
              </p>
              <button
                className="button button-primary button-wide"
                disabled={busy || !supabaseConfigured}
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : null}
                {otpSent ? t("Kodu doğrula") : t("SMS kodu gönder")}
              </button>
            </form>
          )}
          <p className="auth-switch">
            {mode === "login"
              ? t("Henüz hesabınız yok mu?")
              : t("Zaten hesabınız var mı?")}
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setTab("email");
                setError("");
                setNotice("");
                setTerms(false);
                setMarketingOptIn(false);
                setVerificationEmail("");
              }}
            >
              {mode === "login" ? t("Kayıt olun") : t("Giriş yapın")}
            </button>
          </p>
          {initialNotice && !notice && (
            <div className="inline-warning">{initialNotice}</div>
          )}
          {mode === "register" && (
            <p className="auth-terms">
              {t("Kayıt olmak için e-posta adresinizi doğrulamanız gerekir.")}
            </p>
          )}
        </div>
        <Footer onReport={onReport} />
      </section>
    </div>
  );
}

function PublicCard({ token, onReport, previewCard = null }) {
  const { t } = useTranslation();
  const [card, setCard] = useState(() =>
    previewCard ? hydrateCardFromBlocks(previewCard) : null,
  );
  const [loading, setLoading] = useState(!previewCard);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [hideName, setHideName] = useState(false);
  const [hideEmail, setHideEmail] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [pendingExternal, setPendingExternal] = useState(null);
  const [externalLinkError, setExternalLinkError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [copyTimeout, setCopyTimeout] = useState(null);
  const [cardId, setCardId] = useState(null);
  const [demoMode, setDemoMode] = useState(null);
  useEffect(() => {
    let alive = true;
    if (previewCard) {
      setCard(hydrateCardFromBlocks(previewCard));
      setCardId(previewCard.id || "editor-preview");
      setLoading(false);
      setError("");
      return () => {
        alive = false;
      };
    }
    async function resolve() {
      if (import.meta.env.DEV && token === "demo") {
        setCard(hydrateCardFromBlocks(demoCard));
        setCardId(demoCard.id);
        setLoading(false);
        return;
      }
      if (!supabase) {
        setError(t("Bu kart şu anda görüntülenemiyor."));
        setLoading(false);
        return;
      }
      const { data, error: functionError } = await supabase.functions.invoke(
        "resolve-card",
        {
          body: { key: token },
        },
      );
      if (!alive) return;
      if (functionError || !data?.card)
        setError(t("Kart bulunamadı veya artık erişilebilir değil."));
      else {
        setCard(hydrateCardFromBlocks(data.card));
        setCardId(data.card.id);
      }
      setLoading(false);
    }
    resolve();
    return () => {
      alive = false;
    };
  }, [token, t, previewCard]);

  useEffect(
    () => () => {
      if (copyTimeout) window.clearTimeout(copyTimeout);
    },
    [copyTimeout],
  );

  async function copyCardValue(value, feedback) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(t(feedback));
      if (copyTimeout) window.clearTimeout(copyTimeout);
      setCopyTimeout(window.setTimeout(() => setCopyFeedback(""), 2000));
    } catch (copyError) {
      console.error("Could not copy public card value:", copyError);
      setCopyFeedback(t("Panoya kopyalanamadı."));
      if (copyTimeout) window.clearTimeout(copyTimeout);
      setCopyTimeout(window.setTimeout(() => setCopyFeedback(""), 2000));
    }
  }

  const links = useMemo(() => {
    if (!card)
      return {
        google: [],
        social: [],
        custom: [],
        contact: {},
        payment: {},
        profile: {},
      };
    const blocks = card.blocks || [];
    const blockOf = (type) =>
      blocks.find(
        (block) =>
          normalizeBlockType(block.type) === type && block.visible !== false,
      )?.data || {};
    const google = blockOf("google_review");
    const socialData = blockOf("social").links;
    const customData = blockOf("custom_links").links;
    const social = (Array.isArray(socialData) ? socialData : []).filter(
      (item) => item && typeof item.url === "string",
    );
    const customLinks = (Array.isArray(customData) ? customData : []).filter(
      (item) => item && typeof item.url === "string",
    );
    const customButton = blockOf("custom_button");
    const contact = blockOf("contact");
    const channels = contact.channels || {};
    return {
      google:
        google.url || card.google_review_url
          ? [
              {
                label:
                  google.button_text ||
                  google.business_name ||
                  "Google'da değerlendirin",
                url: google.url || card.google_review_url,
              },
            ]
          : [],
      social: social.length
        ? social
        : card.instagram_url
          ? [{ label: "Instagram profili", url: card.instagram_url }]
          : [],
      custom: [...customLinks, ...(card.extra_links || [])].filter(
        (item, index, all) =>
          all.findIndex((value) => value.url === item.url) === index,
      ),
      customButton: customButton.url ? customButton : null,
      note: blockOf("text_or_note"),
      profile: blockOf("profile"),
      payment: blockOf("payment_or_iban"),
      contact: {
        phone: channels.phone === false ? "" : contact.phone || "",
        sms: channels.sms === false ? "" : contact.sms || card.sms || "",
        whatsapp:
          channels.whatsapp === false
            ? ""
            : contact.whatsapp || card.whatsapp || "",
        email:
          channels.email === false ? "" : contact.email || card.email || "",
        maps_url: channels.maps_url === false ? "" : contact.maps_url || "",
        address: channels.address === false ? "" : contact.address || "",
      },
    };
  }, [card]);

  async function submitFeedback(event) {
    event.preventDefault();
    setFeedbackError("");
    setFeedbackBusy(true);
    try {
      const { error: submitError } = await supabase.functions.invoke(
        "submit-feedback",
        {
          body: {
            key: token,
            rating,
            customer_message: message,
            customer_name: customerName,
            customer_contact: contactEmail,
            hide_name: hideName,
            hide_email: hideEmail,
          },
        },
      );
      if (submitError) throw submitError;
      setFeedbackSent(true);
    } catch (submitError) {
      setFeedbackError(
        submitError.message ||
          t("Geri bildiriminiz gönderilemedi. Lütfen tekrar deneyin."),
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  function requestExternal(destination) {
    setExternalLinkError("");
    try {
      const target = new URL(destination.url);
      const safeHttps =
        target.protocol === "https:" &&
        Boolean(target.hostname) &&
        !target.username &&
        !target.password;
      const safeMailto =
        target.protocol === "mailto:" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.pathname);
      const safeSms =
        target.protocol === "sms:" && /^\+?\d{7,15}$/.test(target.pathname);
      const safeTel =
        target.protocol === "tel:" && /^\+?\d{7,15}$/.test(target.pathname);
      if (!safeHttps && !safeMailto && !safeSms && !safeTel) throw new Error();
    } catch {
      setExternalLinkError(t("Bu bağlantı güvenli değil veya desteklenmiyor."));
      return;
    }
    setPendingExternal(destination);
  }

  function downloadVCard() {
    const profile = links.profile;
    const escapeVcard = (value) =>
      String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${escapeVcard(profile.name || card.title)}`,
      links.contact.phone &&
        `TEL;TYPE=CELL:${escapeVcard(links.contact.phone)}`,
      links.contact.email && `EMAIL:${escapeVcard(links.contact.email)}`,
      profile.company && `ORG:${escapeVcard(profile.company)}`,
      "END:VCARD",
    ]
      .filter(Boolean)
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([vcard], { type: "text/vcard;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(card.title) || "contact"}.vcf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function runPrimaryAction() {
    if (!card) return;
    const action = resolvePrimaryAction(card) || {};
    const source = card.blocks?.find(
      (block) => block.id === action.source_block_id && block.visible !== false,
    );
    const data = source?.data || {};
    const sourceItem = Array.isArray(data.links)
      ? data.links.find(
          (item) =>
            item &&
            (item.id === action.source_item_id ||
              item.url === action.source_item_id),
        )
      : null;
    const destination =
      action.url ||
      data.url ||
      sourceItem?.url ||
      data.maps_url ||
      data.links?.[0]?.url ||
      "";
    const phone = data.phone || links.contact.phone || "";
    const whatsapp = data.whatsapp || links.contact.whatsapp || "";
    const iban = sanitizeIban(data.iban || links.payment.iban || card.iban);
    switch (action.type) {
      case "copy_iban":
        return iban
          ? copyCardValue(iban, "IBAN kopyalandı.")
          : setExternalLinkError(t("Bu işlem için IBAN yapılandırılmalıdır."));
      case "copy_text":
        return action.text
          ? copyCardValue(action.text, "Metin kopyalandı.")
          : setExternalLinkError(t("Kopyalanacak metin yapılandırılmalıdır."));
      case "save_contact": {
        return downloadVCard();
      }
      case "call":
        return requestExternal({
          label: "Telefon",
          url: `tel:${String(phone).replace(/[^+\d]/g, "")}`,
        });
      case "whatsapp":
        return requestExternal({
          label: "WhatsApp",
          url: `https://wa.me/${String(whatsapp).replace(/\D/g, "")}`,
        });
      case "website":
      case "social":
      case "maps":
      case "google_review":
      case "custom_url":
        return destination
          ? requestExternal({
              label: action.label || t("Bağlantıyı aç"),
              url: destination,
            })
          : setExternalLinkError(
              t("Bu işlem için geçerli bir bağlantı yapılandırılmalıdır."),
            );
      default:
        return setExternalLinkError(
          t("Önce geçerli bir ana işlem seçilmelidir."),
        );
    }
  }

  if (!loading && error) {
    return <PublicNotFound onReport={onReport} message={t(error)} />;
  }

  // const blockOrder = (type, fallback) => cardBlockOrder(card, type, fallback);
  // const presentationMode = import.meta.env.DEV && token === "demo" && demoMode
  //   ? demoMode
  //   : resolvePresentationMode(card);
  // const actionWarning = validatePrimaryAction(card);
  

const blockOrder = (type, fallback) => cardBlockOrder(card, type, fallback);

const presentationMode =
  import.meta.env.DEV && token === "demo" && demoMode
    ? demoMode
    : resolvePresentationMode(card);

const showcaseAction = resolvePrimaryAction(card);

const actionWarning = validatePrimaryAction(card);

  return (
    <main className={`public-page ${previewCard ? "editor-render-preview" : ""}`} style={cardPaletteStyle(card?.palette)}>
      {!previewCard && <header className="public-header">
        <a className="brand public-brand" href="/">
          <span className="brand-symbol">b.</span>
          <span>bilgi</span>
        </a>
        <div>
          <LanguageSwitcher />
          <button
            className="public-report-link"
            onClick={() =>
              onReport({ cardId, reportedUrl: window.location.href })
            }
          >
            {t("Kötüye kullanım bildirimi")}
          </button>
        </div>
      </header>}
      {!previewCard && import.meta.env.DEV && token === "demo" && (
        <nav
          className="demo-mode-switcher"
          aria-label={t("Demo kart görünümü")}
        >
          {[
            ["classic", "Classic NFC"],
            ["smart", "Smart NFC"],
            ["showcase", "Showcase NFC"],
          ].map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              aria-pressed={presentationMode === mode}
              className={presentationMode === mode ? "selected" : ""}
              onClick={() => setDemoMode(mode)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <article
        className={`public-card public-card-builder public-card-${presentationMode}`}
        data-presentation-mode={presentationMode}
        style={cardPaletteStyle(card?.palette)}
      >
        {loading ? (
          <LoaderCircle className="spin" />
        ) : error ? (
          <>
            <div className="empty-icon">
              <Link2 />
            </div>
            <h1>{t("Kart bulunamadı")}</h1>
            <p>{t(error)}</p>
          </>
        ) : !card.is_active ? (
          <div className="inactive-card-notice" role="status">
            <div className="empty-icon">
              <ShieldCheck />
            </div>
            <h1>{card.title}</h1>
            <p>{t("Bu kart geçici olarak devre dışı bırakılmıştır.")}</p>
          </div>
        ) : (
          <>
            {presentationMode === "showcase" && links.profile.cover_url && (
              <img
                className="showcase-cover"
                src={links.profile.cover_url}
                alt=""
                loading="eager"
              />
            )}
            {presentationMode !== "showcase" && (
              <CompactCardPresentation
                card={card}
                mode={presentationMode}
                profile={links.profile}
                payment={links.payment}
                contact={links.contact}
                social={links.social}
                note={links.note}
                copyFeedback={copyFeedback}
                onPrimaryAction={runPrimaryAction}
                actionWarning={actionWarning}
                onCopy={copyCardValue}
                onExternal={requestExternal}
                pendingExternal={pendingExternal}
                externalLinkError={externalLinkError}
                onCancelExternal={() => setPendingExternal(null)}
                t={t}
              />
            )}
            {presentationMode === "showcase" && (
              <div className="showcase-content">
                {cardBlockVisibility(card, "profile") && (
                  <section
                    className="public-card-block public-identity"
                    style={{ order: blockOrder("profile", 0) }}
                  >
                    <div className="public-avatar">
                      {card.blocks?.find((block) => block.type === "profile")
                        ?.data?.avatar_url ? (
                        <img
                          src={
                            card.blocks.find(
                              (block) => block.type === "profile",
                            ).data.avatar_url
                          }
                          alt=""
                        />
                      ) : (
                        (card.title || "B").slice(0, 1).toLocaleUpperCase("tr")
                      )}
                    </div>
                    <h1 className="public-name-heading">
                      <button
                        type="button"
                        className="copyable-name"
                        aria-label={`${t("Adı kopyala")}: ${card.title}`}
                        onClick={() =>
                          copyCardValue(card.title, "Ad kopyalandı.")
                        }
                      >
                        <span>{card.title}</span>
                        <Copy size={16} aria-hidden="true" />
                      </button>
                    </h1>
                    {(links.profile.category ||
                      links.profile.title ||
                      links.profile.location ||
                      links.profile.company) && (
                      <p className="public-subtitle">
                        {[
                          links.profile.category || links.profile.title,
                          links.profile.location || links.profile.company,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {links.profile.bio && (
                      <p className="public-profile-bio">{links.profile.bio}</p>
                    )}
                  </section>
                )}
                {showcaseAction &&
                  !["copy_iban", "call", "whatsapp", "save_contact"].includes(
                    showcaseAction.type,
                  ) && (
                    <section
                      className="showcase-primary-action"
                      style={{ order: 0 }}
                    >
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={Boolean(actionWarning)}
                        onClick={runPrimaryAction}
                      >
                        {showcaseAction.label ||
                          {
                            custom_url: t("Bağlantıyı aç"),
                            copy_text: t("Metni kopyala"),
                            website: t("Web sitesini aç"),
                            social: t("Sosyal profili aç"),
                            maps: t("Konumu aç"),
                            google_review: t("Google'da yorum yap"),
                          }[showcaseAction.type] ||
                          t("Ana işlem")}
                      </button>
                      {actionWarning && (
                        <small role="alert">{t(actionWarning)}</small>
                      )}
                    </section>
                  )}
                {Array.isArray(links.profile.gallery) &&
                  links.profile.gallery.some(
                    (src) => typeof src === "string" && src.trim(),
                  ) && (
                    <section
                      className="showcase-gallery"
                      aria-label={t("Fotoğraf galerisi")}
                      style={{ order: 5 }}
                    >
                      {links.profile.gallery
                        .filter((src) => typeof src === "string" && src.trim())
                        .map((src, index) => (
                          <img
                            key={`${src}-${index}`}
                            src={src}
                            alt={`${links.profile.name || card.title} · ${index + 1}`}
                            loading="lazy"
                          />
                        ))}
                    </section>
                  )}
                {links.profile.address && (
                  <section className="showcase-detail" style={{ order: 6 }}>
                    <MapPin size={20} aria-hidden="true" />
                    <div>
                      <h2>{t("Adres")}</h2>
                      <p>{links.profile.address}</p>
                    </div>
                    {links.contact.maps_url && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          requestExternal({
                            label: t("Konum"),
                            url: links.contact.maps_url,
                          })
                        }
                      >
                        {t("Haritada aç")} <ExternalLink size={14} />
                      </button>
                    )}
                  </section>
                )}
                {Array.isArray(links.profile.hours) &&
                  links.profile.hours.some(
                    (row) => row && typeof row === "object",
                  ) && (
                    <section className="showcase-detail" style={{ order: 7 }}>
                      <div>
                        <h2>{t("Çalışma saatleri")}</h2>
                        <div className="showcase-hours">
                          {links.profile.hours
                            .filter((row) => row && typeof row === "object")
                            .map((row, index) => (
                              <p key={`${row.days}-${index}`}>
                                <span>{row.days || ""}</span>
                                <span>{row.time || ""}</span>
                              </p>
                            ))}
                        </div>
                      </div>
                    </section>
                  )}
                {cardBlockVisibility(card, "payment") &&
                  (links.payment.bank_name ||
                    card.bank_name ||
                    links.payment.iban ||
                    card.iban) && (
                    <section
                      className="public-card-block public-finance-block"
                      style={{ order: blockOrder("payment", 1) }}
                    >
                      {(links.payment.bank_name || card.bank_name) && (
                        <p className="public-subtitle">
                          {links.payment.bank_name || card.bank_name}
                        </p>
                      )}
                      {(links.payment.iban || card.iban) &&
                        sanitizeIban(links.payment.iban || card.iban) && (
                          <div className="iban-box">
                            {links.payment.recipient_name && (
                              <div className="iban-recipient-row">
                                <span className="iban-recipient-label">
                                  {t("HESAP SAHİBİ")}
                                </span>
                                <button
                                  type="button"
                                  className="copyable-name iban-recipient-name"
                                  aria-label={`${t("Hesap sahibini kopyala")}: ${
                                    links.payment.recipient_name
                                  }`}
                                  onClick={() =>
                                    copyCardValue(
                                      links.payment.recipient_name,
                                      "Hesap sahibi kopyalandı.",
                                    )
                                  }
                                >
                                  <span>{links.payment.recipient_name}</span>
                                  <Copy size={16} aria-hidden="true" />
                                </button>
                              </div>
                            )}
                            <span className="iban-label">{t("IBAN")}</span>
                            <button
                              type="button"
                              className="iban-copy-value"
                              aria-label={t("IBAN'ı kopyala")}
                              onClick={() =>
                                copyCardValue(
                                  sanitizeIban(links.payment.iban || card.iban),
                                  "IBAN kopyalandı.",
                                )
                              }
                            >
                              <strong className="iban-text">
                                {formatIban(
                                  sanitizeIban(links.payment.iban || card.iban),
                                )}
                              </strong>
                              <Copy size={16} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      {links.payment.description && (
                        <p className="public-profile-bio">
                          {links.payment.description}
                        </p>
                      )}
                    </section>
                  )}
                {copyFeedback && (
                  <p
                    className="copy-feedback"
                    role="status"
                    aria-live="polite"
                    style={{ order: 20 }}
                  >
                    {copyFeedback}
                  </p>
                )}
                {cardBlockVisibility(card, "contact") &&
                  Object.values(links.contact).some(Boolean) && (
                    <section
                      className="public-card-block public-contact-block"
                      style={{ order: blockOrder("contact", 3) }}
                    >
                      {links.contact.phone && (
                        <button
                          className="contact-link contact-button"
                          style={{
                            order:
                              showcaseAction?.type === "call" ? -1 : undefined,
                          }}
                          onClick={() =>
                            requestExternal({
                              label: "Telefon",
                              url: `tel:${links.contact.phone.replace(/\D/g, "")}`,
                            })
                          }
                        >
                          <Phone size={17} />{" "}
                          <span>
                            {showcaseAction?.type === "call" &&
                            showcaseAction.label
                              ? showcaseAction.label
                              : t("Ara")}
                          </span>
                        </button>
                      )}
                      {links.contact.email && (
                        <button
                          className="contact-link contact-button"
                          onClick={() =>
                            requestExternal({
                              label: "E-posta gönder",
                              url: mailtoUrl(links.contact.email),
                            })
                          }
                        >
                          <Mail size={17} /> <span>{t("E-posta")}</span>
                        </button>
                      )}
                      {links.contact.whatsapp && (
                        <button
                          className="contact-link contact-button"
                          style={{
                            order:
                              showcaseAction?.type === "whatsapp"
                                ? -1
                                : undefined,
                          }}
                          onClick={() =>
                            requestExternal({
                              label: "WhatsApp",
                              url: `https://wa.me/${links.contact.whatsapp.replace(/\D/g, "")}`,
                            })
                          }
                        >
                          <MessageCircle size={17} />{" "}
                          <span>
                            {showcaseAction?.type === "whatsapp" &&
                            showcaseAction.label
                              ? showcaseAction.label
                              : t("WhatsApp")}
                          </span>
                        </button>
                      )}
                      {links.contact.sms && (
                        <button
                          className="contact-link contact-button"
                          onClick={() =>
                            requestExternal({
                              label: "SMS",
                              url: `sms:+${links.contact.sms.replace(/\D/g, "")}`,
                            })
                          }
                        >
                          <MessageCircle size={17} /> <span>{t("SMS")}</span>
                        </button>
                      )}
                      {links.contact.maps_url && (
                        <button
                          className="contact-link contact-button"
                          style={{
                            order:
                              showcaseAction?.type === "maps" ? -1 : undefined,
                          }}
                          onClick={() =>
                            requestExternal({
                              label: "Harita konumu",
                              url: links.contact.maps_url,
                            })
                          }
                        >
                          <MapPin size={17} /> <span>{t("Konum")}</span>
                        </button>
                      )}
                      {(links.contact.phone || links.contact.email) && (
                        <button
                          type="button"
                          className="contact-link contact-button"
                          style={{
                            order:
                              showcaseAction?.type === "save_contact"
                                ? -1
                                : undefined,
                          }}
                          onClick={downloadVCard}
                        >
                          <UserRound size={17} />
                          <span>
                            {showcaseAction?.type === "save_contact" &&
                            showcaseAction.label
                              ? showcaseAction.label
                              : t("Kişiyi kaydet")}
                          </span>
                        </button>
                      )}
                      {links.contact.address && (
                        <p className="public-profile-bio">
                          {links.contact.address}
                        </p>
                      )}
                    </section>
                  )}
                {card.blocks?.some(
                  (block) =>
                    block.type === "google_review" && block.visible !== false,
                ) && (
                  <section
                    className="rating-section public-card-block"
                    style={{ order: blockOrder("google_review", 2) }}
                  >
                    <h2>{t("Deneyiminiz nasıldı?")}</h2>
                    <p>
                      {t(
                        "Geri bildiriminiz işletmenin hizmetini geliştirmesine yardımcı olur.",
                      )}
                    </p>
                    <div
                      className="rating-buttons"
                      role="group"
                      aria-label={t("1 ile 5 arasında puan verin")}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          type="button"
                          className={rating === value ? "rating-selected" : ""}
                          aria-label={`${value} ${t("yıldız")}`}
                          aria-pressed={rating === value}
                          key={value}
                          onClick={() => {
                            setRating(value);
                            setFeedbackSent(false);
                          }}
                        >
                          {value} <span>★</span>
                        </button>
                      ))}
                    </div>
                    {rating >= 1 &&
                      rating <= 3 &&
                      (feedbackSent ? (
                        <>
                          <div className="inline-success" role="status">
                            {t(
                              "Geri bildiriminiz için teşekkür ederiz. İşletme sizinle iletişime geçebilir.",
                            )}
                          </div>
                          {cardBlockVisibility(card, "contact") &&
                            (card.whatsapp ||
                              card.sms ||
                              card.instagram_url ||
                              card.email) && (
                              <div className="direct-contact">
                                <p>
                                  {t("İşletmeyle doğrudan iletişim kurun:")}
                                </p>
                                {card.whatsapp && (
                                  <button
                                    onClick={() =>
                                      requestExternal({
                                        label: "WhatsApp",
                                        url: `https://wa.me/${card.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(t("Kartınız üzerinden geri bildirim paylaşmak istiyorum."))}`,
                                      })
                                    }
                                  >
                                    {t("WhatsApp")} <ExternalLink size={13} />
                                  </button>
                                )}
                                {card.sms && (
                                  <button
                                    onClick={() =>
                                      requestExternal({
                                        label: "SMS",
                                        url: `sms:+${card.sms.replace(/\D/g, "")}?body=${encodeURIComponent(t("Kartınız üzerinden geri bildirim paylaşmak istiyorum."))}`,
                                      })
                                    }
                                  >
                                    {t("SMS")} <ExternalLink size={13} />
                                  </button>
                                )}
                                {cardBlockVisibility(card, "social") &&
                                  card.instagram_url && (
                                    <button
                                      onClick={() =>
                                        requestExternal({
                                          label: "Instagram",
                                          url: card.instagram_url,
                                        })
                                      }
                                    >
                                      {t("Instagram")}{" "}
                                      <ExternalLink size={13} />
                                    </button>
                                  )}
                                {card.email && (
                                  <button
                                    onClick={() =>
                                      requestExternal({
                                        label: "E-posta",
                                        url: mailtoUrl(
                                          card.email,
                                          t("Kart üzerinden geri bildirim"),
                                        ),
                                      })
                                    }
                                  >
                                    {t("E-posta")} <ExternalLink size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                        </>
                      ) : (
                        <form
                          className="low-rating-form"
                          onSubmit={submitFeedback}
                        >
                          <p>
                            {t(
                              "Yaşadığınız deneyimi doğrudan işletmeye iletin.",
                            )}
                          </p>
                          <textarea
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            maxLength={2000}
                            required
                            placeholder={t(
                              "Geri bildiriminizi buraya yazın...",
                            )}
                          />
                          <input
                            value={customerName}
                            onChange={(event) =>
                              setCustomerName(event.target.value)
                            }
                            maxLength={120}
                            placeholder={t("Adınız (isteğe bağlı)")}
                          />
                          <input
                            type="email"
                            value={contactEmail}
                            onChange={(event) =>
                              setContactEmail(event.target.value)
                            }
                            placeholder={t("E-posta adresiniz (isteğe bağlı)")}
                          />
                          <label className="feedback-privacy-option">
                            <input
                              type="checkbox"
                              checked={hideName}
                              onChange={(event) =>
                                setHideName(event.target.checked)
                              }
                            />
                            {t("Adımı işletmeden gizle")}
                          </label>
                          <label className="feedback-privacy-option">
                            <input
                              type="checkbox"
                              checked={hideEmail}
                              onChange={(event) =>
                                setHideEmail(event.target.checked)
                              }
                            />
                            {t("E-postamı işletmeden gizle")}
                          </label>
                          <small>
                            {t(
                              "Gizlediğiniz bilgiler kart sahibine maskeli gösterilir; platform yöneticileri kötüye kullanımı önlemek için bunlara erişebilir.",
                            )}
                          </small>
                          {feedbackError && (
                            <div className="inline-error" role="alert">
                              {t(feedbackError)}
                            </div>
                          )}
                          <button
                            className="button button-primary button-wide"
                            disabled={feedbackBusy}
                          >
                            {feedbackBusy ? (
                              <LoaderCircle className="spin" size={16} />
                            ) : null}
                            {t("Geri bildirimi gönder")}
                          </button>
                        </form>
                      ))}
                    {rating >= 1 && rating <= 3 && (
                      <button
                        className="neutral-review-link"
                        onClick={() =>
                          requestExternal({
                            label: "Google Haritalar yorumu",
                            url: card.google_review_url,
                          })
                        }
                      >
                        {t(
                          "Veya doğrudan Google Haritalar üzerinde yorum yapın",
                        )}
                      </button>
                    )}
                    {rating >= 4 && (
                      <div className="review-next-step">
                        <p>
                          {t("Google'da yorumunuzu paylaşmak ister misiniz?")}
                        </p>
                        <button
                          className="button button-primary button-wide"
                          onClick={() =>
                            requestExternal({
                              label: "Google Haritalar yorumu",
                              url: card.google_review_url,
                            })
                          }
                        >
                          {t("Google'da Yorum Yap")} <ExternalLink size={15} />
                        </button>
                        <small>
                          {t(
                            "Devam etmeden önce açılacak hedef adresi görebilirsiniz.",
                          )}
                        </small>
                      </div>
                    )}
                  </section>
                )}
                {cardBlockVisibility(card, "google_review") &&
                  links.google.length > 0 && (
                    <div
                      className="public-links public-card-block"
                      style={{ order: blockOrder("google_review", 2) }}
                    >
                      <p className="safe-notice">
                        <ShieldCheck size={15} />{" "}
                        {t(
                          "Harici bağlantıyı açmadan önce hedef adres onayınız için gösterilir.",
                        )}
                      </p>
                      {links.google.map((link) => (
                        <button
                          className="public-link"
                          onClick={() => requestExternal(link)}
                          key={link.label}
                        >
                          <span>{link.label}</span>
                          <ExternalLink size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                {cardBlockVisibility(card, "social") &&
                  links.social.length > 0 && (
                    <div
                      className="public-links public-card-block"
                      style={{ order: blockOrder("social", 4) }}
                    >
                      <p className="safe-notice">
                        <ShieldCheck size={15} />{" "}
                        {t(
                          "Harici bağlantıyı açmadan önce hedef adres onayınız için gösterilir.",
                        )}
                      </p>
                      {links.social.map((link) => (
                        <button
                          className="public-link"
                          onClick={() => requestExternal(link)}
                          key={link.label}
                        >
                          <span>{link.label}</span>
                          <ExternalLink size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                {cardBlockVisibility(card, "custom") &&
                  links.custom.length > 0 && (
                    <div
                      className="public-links public-card-block"
                      style={{ order: blockOrder("custom", 5) }}
                    >
                      <p className="safe-notice">
                        <ShieldCheck size={15} />{" "}
                        {t(
                          "Harici bağlantıyı açmadan önce hedef adres onayınız için gösterilir.",
                        )}
                      </p>
                      {links.custom.map((link) => (
                        <button
                          className="public-link"
                          onClick={() => requestExternal(link)}
                          key={link.label}
                        >
                          <span>{link.label}</span>
                          <ExternalLink size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                {links.customButton &&
                  cardBlockVisibility(card, "custom_button") && (
                    <section
                      className="public-card-block custom-button-block"
                      style={{ order: blockOrder("custom_button", 6) }}
                    >
                      {links.customButton.title && (
                        <h2>{links.customButton.title}</h2>
                      )}
                      {links.customButton.description && (
                        <p>{links.customButton.description}</p>
                      )}
                      <button
                        className="public-link"
                        onClick={() =>
                          requestExternal({
                            label:
                              links.customButton.button_text ||
                              links.customButton.title ||
                              t("Bağlantıyı aç"),
                            url: links.customButton.url,
                          })
                        }
                      >
                        <span>
                          {links.customButton.button_text || t("Bağlantıyı aç")}
                        </span>
                        <ExternalLink size={16} />
                      </button>
                    </section>
                  )}
                {links.note.text &&
                  cardBlockVisibility(card, "text_or_note") && (
                    <section
                      className="public-card-block text-note-block"
                      style={{ order: blockOrder("text_or_note", 7) }}
                    >
                      {links.note.title && <h2>{links.note.title}</h2>}
                      <p>{links.note.text}</p>
                    </section>
                  )}
                {card.blocks?.some(
                  (block) =>
                    block.visible !== false && !isSupportedCardBlock(block),
                ) && (
                  <section
                    className="public-card-block legacy-block-fallback"
                    role="status"
                  >
                    <strong>
                      {t("Bu kartta eski bir içerik bölümü bulunuyor.")}
                    </strong>
                    <p>
                      {t(
                        "Bu bölüm korunuyor; görüntüleme desteği yakında eklenecek.",
                      )}
                    </p>
                  </section>
                )}
                {pendingExternal && (
                  <section
                    className="external-confirmation"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="external-confirmation-title">
                      <ShieldCheck size={16} />
                      <strong>{t("Harici bağlantı")}</strong>
                    </div>
                    <p>
                      <strong>{t(pendingExternal.label)}</strong>{" "}
                      {t("bağlantısını açmak üzeresiniz. Hedef adres:")}
                    </p>
                    <code>{pendingExternal.url}</code>
                    <div>
                      <button
                        className="button button-secondary"
                        onClick={() => setPendingExternal(null)}
                      >
                        {t("Vazgeç")}
                      </button>
                      <a
                        className="button button-primary"
                        href={pendingExternal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("Bağlantıya devam et")} <ExternalLink size={14} />
                      </a>
                    </div>
                  </section>
                )}
                {externalLinkError && (
                  <div className="inline-error" role="alert">
                    {externalLinkError}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </article>
      {!previewCard && <Footer onReport={onReport} />}
    </main>
  );
}

function CompactCardPresentation({
  card,
  mode,
  profile,
  payment,
  contact,
  social,
  note,
  copyFeedback,
  onPrimaryAction,
  actionWarning,
  onCopy,
  onExternal,
  pendingExternal,
  externalLinkError,
  onCancelExternal,
  t,
  preview = false,
}) {
  const actionLabels = {
    copy_iban: "IBAN'ı Kopyala",
    copy_text: "Metni Kopyala",
    save_contact: "Kişiyi Kaydet",
    call: "Ara",
    whatsapp: "WhatsApp'tan Ulaş",
    website: "Web sitesine git",
    social: "Sosyal profili aç",
    maps: "Konumu aç",
    google_review: "Yorum yap",
    custom_url: "Bağlantıyı aç",
  };
  const links = (Array.isArray(social?.links) ? social.links : [])
    .filter((link) => link && typeof link.url === "string" && link.url)
    .slice(0, 4);
  return (
    <div className={`compact-card-content compact-${mode}`}>
      <section className="compact-identity">
        {profile.avatar_url && <img src={profile.avatar_url} alt="" />}
        <div>
          <h1>{profile.name || card.title}</h1>
          {(profile.category ||
            profile.title ||
            profile.location ||
            profile.company) && (
            <p>
              {[
                profile.category || profile.title,
                profile.location || profile.company,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {mode === "smart" && profile.bio && (
            <p className="compact-bio">{profile.bio}</p>
          )}
        </div>
      </section>
      {mode === "classic" &&
        resolvePrimaryAction(card)?.type === "copy_iban" &&
        payment.iban && (
          <section className="classic-payment">
            <p>{payment.bank_name}</p>
            <strong>{formatIban(sanitizeIban(payment.iban))}</strong>
            {payment.recipient_name && <small>{payment.recipient_name}</small>}
          </section>
        )}
      <button
        className="compact-primary-action"
        type="button"
        onClick={onPrimaryAction}
        disabled={preview || Boolean(actionWarning)}
      >
        {resolvePrimaryAction(card)?.label ||
          actionLabels[resolvePrimaryAction(card)?.type] ||
          t("Ana işlem")}
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      {actionWarning && (
        <p className="compact-action-warning" role="status">
          {t("Bu kartın ana işlemi henüz yapılandırılmamış.")}
        </p>
      )}
      {copyFeedback && (
        <p className="copy-feedback" role="status" aria-live="polite">
          {copyFeedback}
        </p>
      )}
      {mode === "smart" && (
        <div className="smart-secondary-actions">
          {contact.phone && <a href={`tel:${contact.phone}`}>{t("Ara")}</a>}
          {contact.whatsapp && (
            <button
              type="button"
              onClick={() =>
                onExternal({
                  label: "WhatsApp",
                  url: `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`,
                })
              }
            >
              {t("WhatsApp")}
            </button>
          )}
          {contact.maps_url && (
            <button
              type="button"
              onClick={() =>
                onExternal({ label: t("Konum"), url: contact.maps_url })
              }
            >
              {t("Konum")}
            </button>
          )}
          {links.slice(0, 2).map((link) => (
            <button
              type="button"
              key={link.url}
              onClick={() => onExternal(link)}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
      {mode === "smart" && note?.text && (
        <p className="smart-note">{note.text}</p>
      )}
      {pendingExternal && (
        <section
          className="external-confirmation"
          role="status"
          aria-live="polite"
        >
          <div className="external-confirmation-title">
            <ShieldCheck size={16} />
            <strong>{t("Harici bağlantı")}</strong>
          </div>
          <p>
            <strong>{t(pendingExternal.label)}</strong>{" "}
            {t("bağlantısını açmak üzeresiniz. Hedef adres:")}
          </p>
          <code>{pendingExternal.url}</code>
          <div>
            <button
              className="button button-secondary"
              type="button"
              onClick={onCancelExternal}
            >
              {t("Vazgeç")}
            </button>
            <a
              className="button button-primary"
              href={pendingExternal.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Bağlantıya devam et")} <ExternalLink size={14} />
            </a>
          </div>
        </section>
      )}
      {externalLinkError && (
        <div className="inline-error" role="alert">
          {externalLinkError}
        </div>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  error = "",
  hint = "",
  counter = "",
  onBlur,
  ...props
}) {
  return (
    <div className={`field-wrap ${error ? "has-field-error" : ""}`}>
      <label className="field">
        <span>
          {label}
          {required && <b> *</b>}
        </span>
        <input
          type={type}
          value={value || ""}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          onBlur={onBlur}
          {...props}
        />
      </label>
      {counter ? <small className="field-counter">{counter}</small> : null}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : null}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </div>
  );
}

function readCardDraft(userId, cardId) {
  try {
    const draft = JSON.parse(
      localStorage.getItem("card_builder_draft") ||
        localStorage.getItem("card_form_draft") ||
        "null",
    );
    if (
      draft?.userId !== userId ||
      draft?.cardId !== (cardId || null) ||
      !draft.form ||
      typeof draft.form !== "object"
    ) {
      return null;
    }
    return {
      ...draft,
      form: serializableCardDraft(draft.form),
      blocks: Array.isArray(draft.blocks) ? draft.blocks : [],
    };
  } catch (error) {
    console.error("Could not read saved card draft:", error);
    return null;
  }
}

function serializableCardDraft(form) {
  const draftForm = { ...form };
  delete draftForm.id;
  delete draftForm.access_token;
  delete draftForm.created_at;
  delete draftForm.updated_at;
  delete draftForm.status;
  return draftForm;
}

function ibanValidationMessage(value, t) {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!normalized) return "";
  if (!normalized.startsWith("TR")) {
    return t(
      "Türkiye IBAN'ları 'TR' ile başlamalıdır. Örnek: TR12 0006 1000 0000 0123 4567 89",
    );
  }
  if (normalized.length < 26) {
    return (
      t("IBAN eksik girildi.") +
      ` ${t("Şu an")} ${normalized.length} ${t("karakter girdiniz")}, ${t(
        "TR dahil toplam 26 karakter olmalıdır.",
      )} ${t("Örnek")}: TR12 0006 1000 0000 0123 4567 89`
    );
  }
  if (
    normalized.length !== 26 ||
    !/^TR\d{24}$/.test(normalized) ||
    !isValidIban(normalized)
  ) {
    return t(
      "Girdiğiniz IBAN geçerli bir hesap formatına uymuyor. Lütfen bankanızın sağladığı gerçek IBAN numarasını kontrol edin.",
    );
  }
  return "";
}

function inlineFieldMessage(blockType, key, value, t) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (key === "iban") return ibanValidationMessage(text, t);
  if (
    ["phone", "sms", "whatsapp"].includes(key) &&
    !/^\d{7,15}$/.test(normalizePhone(text))
  )
    return "Telefon numarası eksik. Örnek: +90 5XX XXX XX XX";
  if (["url", "maps_url", "avatar_url"].includes(key)) {
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error();
    } catch {
      return "Geçerli bir web adresi girin. Örnek: https://instagram.com/kullaniciadi";
    }
  }
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    return "Geçerli bir e-posta girin. Örnek: isim@sirket.com";
  if (
    key === "rating" &&
    (!Number.isFinite(Number(text)) || Number(text) < 0 || Number(text) > 5)
  )
    return "0 ile 5 arasında bir değer girin. Örnek: 4.8";
  return "";
}

function formatTurkishIban(value) {
  const digits = String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 24);
  if (!digits) return "";
  const groups = [];
  if (digits.length > 0) groups.push(digits.slice(0, 2));
  for (let index = 2; index < digits.length; index += 4) {
    groups.push(digits.slice(index, index + 4));
  }
  return `TR${groups.join(" ")}`;
}

function BlockEditor({ block, onChange, onAddLink, onRemoveLink }) {
  const { t } = useTranslation();
  const [blurredFields, setBlurredFields] = useState({});
  if (!isSupportedCardBlock(block)) {
    return (
      <div className="block-edit-fields unsupported-block-notice" role="status">
        <strong>
          {t("Bu eski blok bu düzenleyicide henüz değiştirilemiyor.")}
        </strong>
        <p>
          {t("Kartı kaydettiğinizde içerik ve görünürlük ayarı korunacaktır.")}
        </p>
      </div>
    );
  }
  const fields =
    {
      profile: [
        ["avatar_url", "Profil fotoğrafı veya logo URL'si", "url"],
        ["cover_url", "Kapak fotoğrafı URL'si", "url"],
        ["name", "İsim"],
        ["title", "Unvan"],
        ["category", "Kategori"],
        ["location", "Şehir / konum"],
        ["bio", "Kısa biyografi"],
        ["company", "Şirket adı"],
        ["address", "Açık adres"],
        [
          "gallery_urls",
          "Galeri fotoğrafı URL'leri (her satıra bir URL)",
          "textarea",
        ],
        [
          "hours_text",
          "Çalışma saatleri (Gün | saat, her satıra bir kayıt)",
          "textarea",
        ],
      ],
      google_review: [
        ["business_name", "İşletme adı"],
        ["url", "Google yorum URL'si", "url"],
        ["rating", "Yıldız reytingi", "number"],
        ["review_count", "Yorum sayısı", "number"],
        ["title", "Blok başlığı"],
        ["button_text", "Buton metni"],
      ],
      payment_or_iban: [
        ["bank_name", "Banka adı"],
        ["recipient_name", "Alıcı adı"],
        ["iban", "IBAN"],
        ["description", "Açıklama"],
        ["button_text", "Buton metni"],
      ],
      contact: [
        ["phone", "Telefon"],
        ["sms", "SMS telefonu"],
        ["whatsapp", "WhatsApp telefonu"],
        ["email", "E-posta", "email"],
        ["maps_url", "Google Maps konum bağlantısı", "url"],
        ["address", "Adres"],
      ],
      custom_button: [
        ["title", "Başlık"],
        ["description", "Açıklama"],
        ["url", "URL", "url"],
        ["icon", "İkon"],
        ["button_text", "Buton metni"],
      ],
      custom_links: [],
      social: [],
      text_or_note: [
        ["title", "Başlık"],
        ["text", "Metin / not", "textarea"],
      ],
    }[block.type] || [];
  const links = block.data.links || [];
  const updateField = (key, value) => onChange({ ...block.data, [key]: value });
  const updateLink = (index, key, value) =>
    onChange({
      ...block.data,
      links: links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [key]: value } : link,
      ),
    });
  const linkLimit = block.type === "custom_links" ? 3 : 12;
  const linkLabel = block.type === "social" ? "Sosyal bağlantı" : "Bağlantı";

  return (
    <div className="block-edit-fields">
      {fields.map(([key, label, type]) =>
        type === "textarea" ? (
          <label className="field" key={key}>
            <span>{t(label)}</span>
            <textarea
              value={
                key === "gallery_urls"
                  ? (block.data.gallery || []).join("\n")
                  : key === "hours_text"
                    ? (block.data.hours || [])
                        .map((row) => `${row.days || ""} | ${row.time || ""}`)
                        .join("\n")
                    : block.data[key] || ""
              }
              onChange={(event) => {
                if (key === "gallery_urls")
                  updateField(
                    "gallery",
                    event.target.value
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  );
                else if (key === "hours_text")
                  updateField(
                    "hours",
                    event.target.value
                      .split("\n")
                      .filter(Boolean)
                      .map((line) => {
                        const [days, ...time] = line.split("|");
                        return {
                          days: days.trim(),
                          time: time.join("|").trim(),
                        };
                      }),
                  );
                else updateField(key, event.target.value);
              }}
            />
          </label>
        ) : (
          <TextField
            key={key}
            label={t(label)}
            type={key === "iban" ? "text" : type || "text"}
            inputMode={key === "iban" ? "numeric" : undefined}
            maxLength={key === "iban" ? 32 : undefined}
            value={
              key === "iban"
                ? formatTurkishIban(block.data[key])
                : block.data[key] || ""
            }
            error={
              blurredFields[key]
                ? inlineFieldMessage(block.type, key, block.data[key], t)
                : ""
            }
            hint={
              key === "iban"
                ? t(
                    "IBAN, 'TR' ile başlayıp ardından 24 haneli rakam içermelidir (Toplam 26 karakter). Harf veya boşluk yazmanıza gerek yoktur, otomatik biçimlendirilir.",
                  )
                : ""
            }
            counter={
              key === "iban"
                ? `${String(block.data[key] || "").replace(/\s+/g, "").length}/26 ${t("karakter")}`
                : ""
            }
            placeholder={
              key === "iban"
                ? "TR12 0006 1000 0000 0123 4567 89"
                : key === "phone" || key === "sms" || key === "whatsapp"
                  ? "+90 5XX XXX XX XX"
                  : type === "url"
                    ? "https://instagram.com/kullaniciadi"
                    : type === "email"
                      ? "isim@sirket.com"
                      : undefined
            }
            onChange={(event) =>
              updateField(
                key,
                key === "iban"
                  ? formatTurkishIban(event.target.value)
                  : event.target.value,
              )
            }
            onBlur={() =>
              setBlurredFields((fieldsState) => ({
                ...fieldsState,
                [key]: true,
              }))
            }
          />
        ),
      )}
      {(block.type === "social" || block.type === "custom_links") && (
        <div className="block-link-editor">
          <div className="section-heading-row">
            <strong>{t(linkLabel)}</strong>
            <button
              type="button"
              className="text-button"
              disabled={links.length >= linkLimit}
              onClick={() => onAddLink()}
            >
              <Plus size={14} />
              {t("Bağlantı ekle")}
            </button>
          </div>
          {links.map((link, index) => (
            <div className="block-link-row" key={link.id || index}>
              <TextField
                label={t("Başlık")}
                value={link.label}
                onChange={(event) =>
                  updateLink(index, "label", event.target.value)
                }
              />
              <TextField
                label={t("URL")}
                type="url"
                value={link.url}
                error={inlineFieldMessage("social", "url", link.url)}
                placeholder="https://instagram.com/kullaniciadi"
                onChange={(event) =>
                  updateLink(index, "url", event.target.value)
                }
              />
              <TextField
                label={t("Açıklama")}
                value={link.description}
                onChange={(event) =>
                  updateLink(index, "description", event.target.value)
                }
              />
              <TextField
                label={t("İkon")}
                value={link.icon}
                onChange={(event) =>
                  updateLink(index, "icon", event.target.value)
                }
              />
              <IconButton
                label={t("Bağlantıyı kaldır")}
                className="danger-icon"
                onClick={() => onRemoveLink(index)}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {block.type === "contact" && (
        <div className="block-contact-toggles">
          {["phone", "sms", "whatsapp", "email", "maps_url", "address"].map(
            (key) => (
              <label className="check-row" key={key}>
                <input
                  type="checkbox"
                  checked={block.data.channels?.[key] !== false}
                  onChange={(event) =>
                    updateField("channels", {
                      ...block.data.channels,
                      [key]: event.target.checked,
                    })
                  }
                />
                <span>{t(`Kanal: ${key}`)}</span>
              </label>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function CardModal({
  card,
  onClose,
  onSaved,
  isAdmin,
  canSkipScan,
  accessToken,
  user,
  clients,
  startManaged = false,
}) {
  const { t } = useTranslation();
  const [activeEditorSection, setActiveEditorSection] = useState("content");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  useEffect(() => {
    if (mobilePreviewOpen)
      document.querySelector(".card-editor-workspace .editor-form")?.scrollTo({
        top: 0,
        behavior: "auto",
      });
  }, [mobilePreviewOpen]);
  const [savedDraft] = useState(() => readCardDraft(user.id, card?.id));
  const [form, setForm] = useState(() => {
    const initial = card
      ? { ...initialCard, ...card, extra_links: card.extra_links || [] }
      : {
          ...initialCard,
          managed_by_admin: startManaged,
          user_id: startManaged && clients.length ? clients[0].id : user.id,
        };
    initial.presentation_mode = resolvePresentationMode(card);
    initial.primary_action = resolvePrimaryAction(card) || {
      type: "",
      source_block_id: "",
      label: "",
      url: "",
      text: "",
    };
    return savedDraft
      ? {
          ...initial,
          ...savedDraft.form,
          palette_id: card
            ? card.palette_id || null
            : savedDraft.form.palette_id || null,
          extra_links: Array.isArray(savedDraft.form.extra_links)
            ? savedDraft.form.extra_links
            : initial.extra_links,
        }
      : {
          ...initial,
          palette_id: card?.palette_id || null,
        };
  });
  const [blocks, setBlocks] = useState(() =>
    makeCardBlocks(
      savedDraft?.blocks?.length ? savedDraft.blocks : card?.blocks || [],
      card || {},
    ),
  );
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [palettes, setPalettes] = useState([]);
  const [paletteLoading, setPaletteLoading] = useState(true);
  const [paletteError, setPaletteError] = useState("");
  const [suggestedPalette, setSuggestedPalette] = useState(null);
  const [customPaletteOpen, setCustomPaletteOpen] = useState(false);
  const [customPaletteName, setCustomPaletteName] = useState("");
  const [customPaletteTokens, setCustomPaletteTokens] = useState(() => ({
    background: "#0F172A",
    surface: "#1E293B",
    text: "#F8FAFC",
    primary: "#38BDF8",
    accent: "#22C55E",
    muted: "#94A3B8",
    button_text: "#0F172A",
  }));
  const [customPaletteDirty, setCustomPaletteDirty] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    () => savedDraft?.slugManuallyEdited ?? Boolean(card?.slug),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [isDirty, setIsDirty] = useState(Boolean(savedDraft));
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadPalettes() {
      if (!supabase) {
        setPaletteError(t("Renk temaları şu anda kullanılamıyor."));
        setPaletteLoading(false);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("palette_definitions")
        .select("id,name,description,tokens,is_default,kind,moderation_status")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (!alive) return;
      if (loadError) {
        console.error("Palette query failed:", loadError);
        setPaletteError(t("Renk temaları yüklenemedi."));
      } else {
        setPalettes(
          (data || []).filter((palette) => {
            try {
              validatePaletteTokens(palette.tokens);
              return true;
            } catch {
              return false;
            }
          }),
        );
      }
      setPaletteLoading(false);
    }
    loadPalettes();
    return () => {
      alive = false;
    };
  }, [t]);

  function persistDraft() {
    try {
      localStorage.setItem(
        "card_builder_draft",
        JSON.stringify({
          userId: user.id,
          cardId: card?.id || null,
          form: serializableCardDraft(form),
          blocks,
          slugManuallyEdited,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch (draftError) {
      console.error("Could not save card draft:", draftError);
    }
  }

  function openCustomPaletteEditor() {
    const selected = palettes.find((palette) => palette.id === form.palette_id);
    const fallback = palettes.find((palette) => palette.is_default);
    const source = selected?.tokens || fallback?.tokens;
    if (source) {
      setCustomPaletteTokens({ ...source });
      setCustomPaletteName(selected?.kind === "custom" ? selected.name : "");
    }
    setCustomPaletteOpen(true);
  }

  function updateCustomPaletteToken(token, value) {
    setCustomPaletteDirty(true);
    setCustomPaletteTokens((current) => ({ ...current, [token]: value }));
  }

  async function saveEditedPalette() {
    setPaletteError("");
    const tokens = validatePaletteTokens(customPaletteTokens);
    if (paletteContrastIssues(tokens).length) {
      throw new Error(
        t("Özel temada metin ve düğme renkleri en az 4,5:1 kontrast sağlamalıdır."),
      );
    }
    const name = customPaletteName.trim();
    if (!name) throw new Error(t("Özel palet adı zorunludur."));
    const savedPalette = await saveCustomPalette(supabase, {
      id:
        palettes.find((palette) => palette.id === form.palette_id)?.kind ===
        "custom"
          ? form.palette_id
          : undefined,
      name,
      tokens,
      owner_user_id: user.id,
    });
    setPalettes((current) => [
      savedPalette,
      ...current.filter((palette) => palette.id !== savedPalette.id),
    ]);
    update("palette_id", savedPalette.id);
    setCustomPaletteDirty(false);
    setCustomPaletteOpen(false);
    return savedPalette;
  }

  useEffect(() => {
    if (!isDirty || busy) return undefined;
    const timer = window.setTimeout(persistDraft, 400);
    return () => window.clearTimeout(timer);
  }, [blocks, busy, card?.id, form, isDirty, slugManuallyEdited, user.id]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const persistBeforeHistoryNavigation = () => persistDraft();
    window.addEventListener("popstate", persistBeforeHistoryNavigation);
    return () =>
      window.removeEventListener("popstate", persistBeforeHistoryNavigation);
  }, [blocks, card?.id, form, isDirty, slugManuallyEdited, user.id]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warnBeforeUnload = (event) => {
      persistDraft();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [blocks, card?.id, form, isDirty, slugManuallyEdited, user.id]);

  function requestClose(nextSection = "cards") {
    if (
      isDirty &&
      !window.confirm(
        t(
          "Kaydedilmemiş değişiklikleriniz var. Çıkmak istediğinize emin misiniz?",
        ),
      )
    )
      return;
    if (isDirty) persistDraft();
    onClose(nextSection);
  }

  function navigateEditorSection(section) {
    setActiveEditorSection(section);
    const targetId = {
      content: "editor-content",
      appearance: "editor-appearance",
      action: "editor-primary-action",
      nfc: "editor-nfc",
      settings: "editor-settings",
    }[section];
    document.getElementById(targetId)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function update(key, value) {
    setIsDirty(true);
    setForm((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "title" && !slugManuallyEdited
        ? { slug: slugify(value) }
        : {}),
    }));
  }

  function fillAdminTestData() {
    const payment = blocks.find((block) => block.type === "payment_or_iban");
    const testIban = "TR40 0006 1000 0000 0123 4567 89";
    const testRecipient = "Test A.Ş.";
    if (payment) {
      updateBlock(payment.id, {
        ...payment.data,
        iban: testIban,
        recipient_name: testRecipient,
        bank_name: payment.data.bank_name || "Test Bankası",
      });
      setExpandedBlockId(payment.id);
    } else {
      const nextBlock = createCardBlock("payment_or_iban", blocks.length, {
        iban: testIban,
        recipient_name: testRecipient,
        bank_name: "Test Bankası",
      });
      setBlocks((current) => [...current, nextBlock]);
      setExpandedBlockId(nextBlock.id);
      setIsDirty(true);
    }
    setDevToolsOpen(false);
  }

  function moveBlock(index, direction) {
    setIsDirty(true);
    setBlocks((current) => {
      const ordered = [...current].sort((a, b) => a.order - b.order);
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return current;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered.map((block, order) => ({ ...block, order }));
    });
  }

  function updateBlock(id, data) {
    setIsDirty(true);
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, data } : block)),
    );
    const profile = blocks.find(
      (block) => block.id === id && block.type === "profile",
    );
    if (profile && data.name !== undefined) update("title", data.name);
    if (
      profile?.type === "social" ||
      blocks.find((block) => block.id === id)?.type === "social"
    ) {
      const text = (data.links || [])
        .map((link) => `${link.label || ""} ${link.url || ""}`)
        .join(" ")
        .toLocaleLowerCase("tr");
      const presetKey = /linkedin/.test(text)
        ? "linkedin"
        : /instagram/.test(text)
          ? "instagram"
          : null;
      if (presetKey) {
        setSuggestedPalette(palettePresets[presetKey]);
        const matchingPalette = palettes.find((palette) =>
          palette.name
            .toLocaleLowerCase("tr")
            .includes(palettePresets[presetKey].name.toLocaleLowerCase("tr")),
        );
        if (matchingPalette) update("palette_id", matchingPalette.id);
      }
    }
  }

  function addBlock(type) {
    setIsDirty(true);
    const existing = blocks.find(
      (block) => block.type === normalizeBlockType(type),
    );
    if (existing) {
      setExpandedBlockId(existing.id);
      if (["social", "custom_links"].includes(existing.type)) {
        addBlockLink(existing);
      }
      return;
    }
    const nextBlock = createCardBlock(type, blocks.length);
    setBlocks((current) => [...current, nextBlock]);
    setExpandedBlockId(nextBlock.id);
    const preset = palettePresets[type];
    if (preset) {
      setSuggestedPalette(preset);
      const matchingPalette = palettes.find((palette) =>
        palette.name
          .toLocaleLowerCase("tr")
          .includes(preset.name.toLocaleLowerCase("tr")),
      );
      if (matchingPalette) update("palette_id", matchingPalette.id);
    }
  }

  function duplicateBlock(block) {
    setIsDirty(true);
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === block.id);
      const copy = createCardBlock(
        block.type,
        index + 1,
        structuredClone(block.data || {}),
      );
      const ordered = [...current];
      ordered.splice(index + 1, 0, copy);
      return ordered.map((item, order) => ({ ...item, order }));
    });
  }

  function removeBlock(id) {
    setIsDirty(true);
    setBlocks((current) =>
      current
        .filter((block) => block.id !== id)
        .map((block, order) => ({ ...block, order })),
    );
  }

  function reorderBlocks(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    setIsDirty(true);
    setBlocks((current) => {
      const ordered = [...current].sort(
        (left, right) => left.order - right.order,
      );
      const sourceIndex = ordered.findIndex((block) => block.id === sourceId);
      const targetIndex = ordered.findIndex((block) => block.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moving] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moving);
      return ordered.map((block, order) => ({ ...block, order }));
    });
  }

  function setBlockVisible(id, visible) {
    setIsDirty(true);
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, visible } : block)),
    );
  }

  function addBlockLink(block) {
    const links = block.data.links || [];
    const limit = block.type === "custom_links" ? 3 : 12;
    if (links.length >= limit) return;
    updateBlock(block.id, {
      ...block.data,
      links: [
        ...links,
        {
          id: crypto.randomUUID(),
          label: "",
          url: "",
          description: "",
          icon: "",
        },
      ],
    });
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!form.title.trim()) throw new Error(t("Kart adı zorunludur."));
      if (
        form.access_mode === "public" &&
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)
      ) {
        throw new Error(
          t("Herkese açık kart için geçerli bir kısa bağlantı yazın."),
        );
      }
      if (card?.compatibility?.errors?.length) {
        throw new Error(
          t(
            "Bu kartın eski blok verisi geçersiz olduğu için güvenle kaydedilemiyor.",
          ),
        );
      }
      const normalizedBlocks = serializeCardBlocks(blocks).map((block) =>
        block.type === "profile"
          ? {
              ...block,
              data: {
                ...block.data,
                name: block.data.name?.trim() || form.title.trim(),
              },
            }
          : block,
      );
      if (
        !normalizedBlocks.some(
          (block) => block.type === "profile" || block.type === "header",
        )
      ) {
        throw new Error(t("En az bir profil veya başlık bloğu ekleyin."));
      }
      const reviewBlock = normalizedBlocks.find(
        (block) => block.type === "google_review",
      );
      if (reviewBlock && !reviewBlock.data.url?.trim())
        throw new Error(t("Google yorum bloğunda URL zorunludur."));
      const paymentBlock = normalizedBlocks.find(
        (block) => block.type === "payment_or_iban",
      );
      if (paymentBlock?.data.iban && !isValidIban(paymentBlock.data.iban))
        throw new Error(ibanValidationMessage(paymentBlock.data.iban, t));
      if (
        [form.whatsapp, form.sms].some(
          (phone) => phone && !/^\d{7,15}$/.test(normalizePhone(phone)),
        )
      ) {
        throw new Error(
          t(
            "Telefon numaralarını ülke koduyla birlikte, yalnızca rakam olarak girin.",
          ),
        );
      }
      setScanNotice("");
      setScanning(true);
      const checkUrl = async (value) => {
        const result = await scanExternalUrl(value, {
          accessToken,
          skipScan: canSkipScan,
        });
        if (result.reviewRequired)
          setScanNotice(
            t(
              "Güvenlik servisine şu an ulaşılamadı. Kartınız incelemeye alınmak üzere kaydedilecektir.",
            ),
          );
        return result.url;
      };
      const scannedBlocks = [];
      for (const block of normalizedBlocks) {
        const data = { ...block.data };
        if (
          ["google_review", "custom_button"].includes(block.type) &&
          data.url?.trim()
        ) {
          data.url = await checkUrl(data.url);
        }
        if (["social", "custom_links"].includes(block.type)) {
          const links = [];
          for (const item of data.links || []) {
            if (!item.label?.trim() || !item.url?.trim())
              throw new Error(
                t(
                  "Ek bağlantılarda etiket ve URL alanlarını birlikte doldurun.",
                ),
              );
            links.push({
              ...item,
              label: item.label.trim(),
              url: await checkUrl(item.url),
            });
          }
          data.links = links;
        }
        if (block.type === "contact" && data.maps_url?.trim())
          data.maps_url = await checkUrl(data.maps_url);
        scannedBlocks.push({ ...block, data });
      }
      const configuredAction = form.primary_action?.type
        ? { ...form.primary_action }
        : null;
      if (configuredAction) {
        const actionError = validatePrimaryAction(
          { ...card, blocks: scannedBlocks },
          configuredAction,
        );
        if (actionError) throw new Error(t(actionError));
        if (configuredAction.url?.trim())
          configuredAction.url = await checkUrl(configuredAction.url.trim());
        if (
          configuredAction.type === "copy_text" &&
          !configuredAction.text?.trim()
        )
          throw new Error(t("Kopyalanacak metin zorunludur."));
      }
      const profileSettings = scannedBlocks.find(
        (block) => block.type === "profile",
      );
      if (profileSettings) {
        profileSettings.data.presentation_mode =
          form.presentation_mode || "showcase";
        if (configuredAction)
          profileSettings.data.primary_action = configuredAction;
        else delete profileSettings.data.primary_action;
        if (profileSettings.data.cover_url?.trim())
          profileSettings.data.cover_url = validateHttpsUrl(
            profileSettings.data.cover_url.trim(),
          );
        profileSettings.data.gallery = (
          Array.isArray(profileSettings.data.gallery)
            ? profileSettings.data.gallery
            : []
        )
          .map((url) => validateHttpsUrl(String(url).trim()))
          .filter(Boolean);
      }
      setScanning(false);
      let paletteId = form.palette_id || null;
      if (customPaletteDirty) {
        const savedPalette = await saveEditedPalette();
        paletteId = savedPalette.id;
      }
      const legacyFields = legacyFieldsForCardSave(card || {}, scannedBlocks);
      const profile = scannedBlocks.find((block) => block.type === "profile");
      if (profile?.data.avatar_url?.trim())
        profile.data.avatar_url = validateHttpsUrl(profile.data.avatar_url);
      const values = {
        title: form.title.trim(),
        type: "digital_card",
        access_mode: form.access_mode,
        slug: form.access_mode === "public" ? form.slug : null,
        access_token:
          form.access_mode === "private"
            ? card?.access_token || newAccessToken()
            : null,
        ...legacyFields,
        blocks: scannedBlocks,
        nfc_active: form.nfc_active,
        user_id: isAdmin ? form.user_id || user.id : user.id,
        managed_by_admin: isAdmin && form.managed_by_admin,
        client_notes:
          isAdmin && form.managed_by_admin
            ? String(form.client_notes || "").trim() || null
            : null,
        palette_id: paletteId,
      };
      const safeValues = { ...values };
      if (!canSkipScan) delete safeValues.nfc_active;
      const query = card
        ? supabase
            .from("nfc_cards")
            .update(safeValues)
            .eq("id", card.id)
            .select()
            .single()
        : supabase.from("nfc_cards").insert(safeValues).select().single();
      const { data, error: saveError } = await query;
      if (saveError) throw saveError;
      try {
        localStorage.removeItem("card_builder_draft");
        localStorage.removeItem("card_form_draft");
      } catch (draftError) {
        console.error("Could not remove saved card draft:", draftError);
      }
      setIsDirty(false);
      onSaved(data);
    } catch (saveError) {
      setScanning(false);
      setError(saveError.message || t("Kart kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  }

  const profilePreview =
    blocks.find((block) => block.type === "profile" && block.visible)?.data ||
    {};
  const paymentPreview =
    blocks.find((block) => block.type === "payment_or_iban" && block.visible)
      ?.data || {};
  const contactPreview =
    blocks.find((block) => block.type === "contact" && block.visible)?.data ||
    {};
  const socialPreview =
    blocks.find((block) => block.type === "social" && block.visible)?.data ||
    {};
  const notePreview =
    blocks.find((block) => block.type === "text_or_note" && block.visible)
      ?.data || {};
  const previewCard = {
    ...form,
    title: form.title || t("Kart / işletme adı"),
    blocks,
    primary_action: form.primary_action,
    palette:
      palettes.find((palette) => palette.id === form.palette_id)?.tokens ||
      suggestedPalette?.tokens ||
      palettes.find((palette) => palette.is_default)?.tokens,
  };
  return (
    <div
      className={`modal-backdrop ${card ? "editor-backdrop" : "quick-create-backdrop"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={`modal card-modal ${card ? "card-editor-workspace" : "quick-create"} ${startManaged ? "managed-create" : ""} ${mobilePreviewOpen ? "preview-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
      >
        {card && (
          <nav className="editor-sidebar" aria-label={t("Dashboard navigation")}>
            <a className="editor-brand" href="/dashboard" onClick={(event) => { event.preventDefault(); requestClose("overview"); }}>
              <span className="brand-symbol">b.</span><span>bilgi</span>
            </a>
            <span className="editor-workspace-label">{t("Çalışma alanı")}</span>
            <button type="button" onClick={() => requestClose("overview")}>{t("Genel Bakış")}</button>
            <button type="button" className="selected" aria-current="page" onClick={() => requestClose("cards")}>{t("Kartlarım")}</button>
            <button type="button" onClick={() => requestClose("feedback")}>{t("Geri bildirimler")}</button>
            <button type="button" onClick={() => requestClose("settings")}>{t("Hesap ayarları")}</button>
          </nav>
        )}
        <header className="modal-header editor-topbar">
          <div>
            <p className="eyebrow">
              {card ? t("KART AYARLARI") : t("YENİ KART")}
            </p>
            <h2 id="card-modal-title">
              {card ? t("Kartı düzenle") : t("Yeni dijital kart oluştur")}
            </h2>
          </div>
          <IconButton label={t("Pencereyi kapat")} onClick={requestClose}>
            <X size={19} />
          </IconButton>
          {card && (
            <div className="editor-topbar-actions">
              <span className="editor-save-state" role="status">
                {busy ? t("Kaydediliyor…") : isDirty ? t("Kaydedilmemiş değişiklikler") : t("Tüm değişiklikler kaydedildi")}
              </span>
              <button
                type="button"
                className="button button-secondary editor-preview-toggle"
                onClick={() => setMobilePreviewOpen((open) => !open)}
              >
                {mobilePreviewOpen ? t("Düzenlemeye dön") : t("Önizleme")}
              </button>
              <button type="submit" form="card-editor-form" className="button button-primary" disabled={busy || !supabaseConfigured}>
                {busy ? <LoaderCircle className="spin" size={16} /> : null} {t("Değişiklikleri kaydet")}
              </button>
            </div>
          )}
        </header>
        <form id="card-editor-form" className="modal-body editor-form" onSubmit={save}>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {scanNotice && (
            <div className="inline-warning" role="status">
              {scanNotice}
            </div>
          )}
          {card && (
            <nav
              className="editor-section-nav"
              aria-label={t("Kart düzenleme bölümleri")}
            >
              {[
                ["content", "İçerik"],
                ["appearance", "Görünüm"],
                ["action", "Ana işlem"],
                ["nfc", "NFC"],
                ["settings", "Ayarlar"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={activeEditorSection === key ? "active" : ""}
                  aria-current={
                    activeEditorSection === key ? "step" : undefined
                  }
                  onClick={() => navigateEditorSection(key)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
          )}
          {isAdmin && (
            <div className="dev-tools">
              <button
                type="button"
                className="button button-quiet"
                aria-expanded={devToolsOpen}
                onClick={() => setDevToolsOpen((open) => !open)}
              >
                🛠️ {t("DevTools / Test verisi")}
              </button>
              {devToolsOpen && (
                <div className="dev-tools-panel">
                  <p>
                    {t("Yalnızca yönetici testleri için örnek veri doldurur.")}
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={fillAdminTestData}
                  >
                    {t("Geçerli test IBAN'ı ve alıcı adı doldur")}
                  </button>
                  <small>
                    {t(
                      "Üretim doğrulamaları atlanmaz; yalnızca güvenli test verisi eklenir.",
                    )}
                  </small>
                </div>
              )}
            </div>
          )}
          <div className="form-section quick-create-basics" id="editor-settings">
            <h3>
              01 <span>{t("Temel bilgiler")}</span>
            </h3>
            <TextField
              label={t("Kart / işletme adı")}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder={t("Örn. Mavi Kahve")}
              required
            />
            <div className="segmented">
              <button
                type="button"
                className={form.access_mode === "public" ? "active" : ""}
                onClick={() => update("access_mode", "public")}
              >
                <Globe2 size={15} /> {t("Herkese açık")}
              </button>
              <button
                type="button"
                className={form.access_mode === "private" ? "active" : ""}
                onClick={() => update("access_mode", "private")}
              >
                <ShieldCheck size={15} /> {t("Gizli bağlantı")}
              </button>
            </div>
            {form.access_mode === "public" ? (
              <div className="slug-field">
                <span>{appOrigin}/c/</span>
                <input
                  value={form.slug}
                  onChange={(event) => {
                    setSlugManuallyEdited(true);
                    update("slug", slugify(event.target.value));
                  }}
                  placeholder="isletme-adi"
                  required
                />
              </div>
            ) : (
              <p className="field-hint">
                {t(
                  "Kaydedildiğinde yalnızca bağlantıya sahip kişilerin erişebileceği güçlü, rastgele bir bağlantı oluşturulur.",
                )}
              </p>
            )}
          </div>
          <section className="form-section presentation-mode-editor" id="editor-appearance">
            <div className="section-heading-row">
              <h3>
                02 <span>{t("Kart Görünümü")}</span>
              </h3>
            </div>
            <div
              className="presentation-mode-options"
              role="radiogroup"
              aria-label={t("Kart görünümü")}
            >
              {[
                [
                  "classic",
                  "Classic NFC",
                  "Hızlı ve tek amaçlı",
                  "En uygun: ödeme, kişi veya tek bağlantı",
                ],
                [
                  "smart",
                  "Smart NFC",
                  "Kompakt dijital kart",
                  "En uygun: birkaç önemli iletişim seçeneği",
                ],
                [
                  "showcase",
                  "Showcase NFC",
                  "Detaylı işletme profili",
                  "En uygun: zengin işletme vitrini",
                ],
              ].map(([mode, title, description, useCase]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={form.presentation_mode === mode}
                  className={`presentation-mode-option ${form.presentation_mode === mode ? "selected" : ""}`}
                  onClick={() => update("presentation_mode", mode)}
                >
                  <span
                    className={`mode-mini-preview mode-mini-${mode}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{title}</strong>
                  <span>{t(description)}</span>
                  <small>{t(useCase)}</small>
                </button>
              ))}
            </div>
            <div className="primary-action-editor" id="editor-primary-action">
              <h4>{t("Ana işlem")}</h4>
              <p className="field-hint">
                {t(
                  "Ziyaretçinin kartı açtığında yapmasını istediğiniz işlemi seçin.",
                )}
              </p>
              <label className="field">
                <span>{t("İşlem türü")}</span>
                <select
                  value={form.primary_action?.type || ""}
                  onChange={(event) =>
                    update("primary_action", {
                      ...form.primary_action,
                      type: event.target.value,
                      source_block_id: "",
                    })
                  }
                >
                  <option value="">{t("İşlem seçin")}</option>
                  {[
                    ["copy_iban", "IBAN kopyala"],
                    ["save_contact", "Kişiyi kaydet"],
                    ["call", "Telefon et"],
                    ["whatsapp", "WhatsApp aç"],
                    ["website", "Web sitesi aç"],
                    ["social", "Sosyal profil aç"],
                    ["maps", "Konumu aç"],
                    ["google_review", "Google yorumu aç"],
                    ["custom_url", "Özel bağlantı"],
                    ["copy_text", "Metni kopyala"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              {form.primary_action?.type && (
                <>
                  {!["custom_url", "copy_text"].includes(
                    form.primary_action.type,
                  ) && (
                    <label className="field">
                      <span>{t("İçerik kaynağı")}</span>
                      <select
                        value={form.primary_action.source_block_id || ""}
                        onChange={(event) =>
                          update("primary_action", {
                            ...form.primary_action,
                            source_block_id: event.target.value,
                            source_item_id: "",
                          })
                        }
                      >
                        <option value="">{t("Kaynak seçin")}</option>
                        {blocks
                          .filter((block) =>
                            (
                              ({
                                copy_iban: ["payment_or_iban"],
                                save_contact: ["profile", "contact"],
                                call: ["contact"],
                                whatsapp: ["contact"],
                                website: [
                                  "social",
                                  "custom_links",
                                  "custom_button",
                                ],
                                social: ["social"],
                                maps: ["contact"],
                                google_review: ["google_review"],
                              })[form.primary_action.type] || CARD_BLOCK_TYPES
                            ).includes(block.type),
                          )
                          .map((block) => (
                            <option key={block.id} value={block.id}>
                              {t(cardBlockLabels[block.type] || block.type)}
                              {block.visible === false
                                ? ` · ${t("gizli")}`
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {(() => {
                    const sourceBlock = blocks.find(
                      (block) =>
                        block.id === form.primary_action.source_block_id,
                    );
                    const items = Array.isArray(sourceBlock?.data?.links)
                      ? sourceBlock.data.links.filter(
                          (item) => item && item.url,
                        )
                      : [];
                    return items.length ? (
                      <label className="field">
                        <span>{t("Bağlantı seçin")}</span>
                        <select
                          value={form.primary_action.source_item_id || ""}
                          onChange={(event) =>
                            update("primary_action", {
                              ...form.primary_action,
                              source_item_id: event.target.value,
                            })
                          }
                        >
                          <option value="">{t("İlk uygun bağlantı")}</option>
                          {items.map((item) => {
                            const value = item.id || item.url;
                            return (
                              <option key={value} value={value}>
                                {item.label || item.url}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ) : null;
                  })()}
                  {form.primary_action.type === "custom_url" && (
                    <TextField
                      label={t("Güvenli hedef URL")}
                      type="url"
                      value={form.primary_action.url}
                      placeholder="https://example.com"
                      onChange={(event) =>
                        update("primary_action", {
                          ...form.primary_action,
                          url: event.target.value,
                        })
                      }
                    />
                  )}
                  {form.primary_action.type === "copy_text" && (
                    <label className="field">
                      <span>{t("Kopyalanacak metin")}</span>
                      <textarea
                        value={form.primary_action.text || ""}
                        onChange={(event) =>
                          update("primary_action", {
                            ...form.primary_action,
                            text: event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  <TextField
                    label={t("Özel buton etiketi (isteğe bağlı)")}
                    value={form.primary_action.label || ""}
                    onChange={(event) =>
                      update("primary_action", {
                        ...form.primary_action,
                        label: event.target.value,
                      })
                    }
                  />
                  {form.primary_action.source_block_id &&
                    validatePrimaryAction({ blocks }, form.primary_action) && (
                      <div className="inline-warning" role="alert">
                        {t(
                          validatePrimaryAction(
                            { blocks },
                            form.primary_action,
                          ),
                        )}
                      </div>
                    )}
                </>
              )}
            </div>
          </section>
          <div className="form-section card-builder-section" id="editor-content">
            <div className="section-heading-row">
              <h3>
                <span>{t("Kart blokları")}</span>
              </h3>
              <label className="field add-block-field">
                <span>{t("Blok ekle")}</span>
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) addBlock(event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("Blok türü seçin")}</option>
                  {CARD_BLOCK_TYPES.filter(
                    (type) =>
                      type !== "profile" ||
                      !blocks.some((block) => block.type === "profile"),
                  ).map((type) => (
                    <option key={type} value={type}>
                      {t(cardBlockLabels[type])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-hint">
              {t(
                "Blokları ekleyip içeriklerini düzenleyin; sürükleyerek sıralayabilir veya yukarı/aşağı kontrollerini kullanabilirsiniz.",
              )}
            </p>
            <div className="card-builder-layout">
              <div
                className="card-builder-list"
                aria-label={t("Kart blokları")}
              >
                {[...blocks]
                  .sort((a, b) => a.order - b.order)
                  .map((block, index) => (
                    <div
                      className={`card-builder-item ${block.visible ? "" : "is-hidden"} ${expandedBlockId === block.id ? "is-expanded" : ""}`}
                      key={block.id}
                      draggable
                      onDragStart={() => setDraggedBlockId(block.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        reorderBlocks(draggedBlockId, block.id);
                        setDraggedBlockId(null);
                      }}
                    >
                      <div
                        className="block-item-heading"
                        onClick={() =>
                          setExpandedBlockId(
                            expandedBlockId === block.id ? null : block.id,
                          )
                        }
                      >
                        <button
                          type="button"
                          className="block-expand-button"
                          aria-expanded={expandedBlockId === block.id}
                        >
                          <strong>
                            {t(cardBlockLabels[block.type] || block.type)}
                          </strong>
                          <span>
                            {expandedBlockId === block.id
                              ? t("Kapat")
                              : t("Düzenle")}
                          </span>
                        </button>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            onClick={(event) => event.stopPropagation()}
                            checked={block.visible}
                            onChange={(event) =>
                              setBlockVisible(block.id, event.target.checked)
                            }
                          />
                          <span>{t("Görünür")}</span>
                        </label>
                      </div>
                      <div className="block-reorder-actions">
                        <button
                          type="button"
                          className="text-button"
                          disabled={index === 0}
                          aria-label={`${t("Yukarı taşı")}: ${t(cardBlockLabels[block.type])}`}
                          onClick={() => moveBlock(index, -1)}
                        >
                          {t("Yukarı")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={index === blocks.length - 1}
                          aria-label={`${t("Aşağı taşı")}: ${t(cardBlockLabels[block.type])}`}
                          onClick={() => moveBlock(index, 1)}
                        >
                          {t("Aşağı")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={!isSupportedCardBlock(block)}
                          onClick={() => duplicateBlock(block)}
                        >
                          {t("Kopyala")}
                        </button>
                        <button
                          type="button"
                          className="text-button danger-text"
                          disabled={
                            block.type === "profile" ||
                            !isSupportedCardBlock(block)
                          }
                          onClick={() => removeBlock(block.id)}
                        >
                          {t("Sil")}
                        </button>
                      </div>
                      {expandedBlockId === block.id && (
                        <BlockEditor
                          block={block}
                          onChange={(data) => updateBlock(block.id, data)}
                          onAddLink={() => addBlockLink(block)}
                          onRemoveLink={(linkIndex) =>
                            updateBlock(block.id, {
                              ...block.data,
                              links: (block.data.links || []).filter(
                                (_, index) => index !== linkIndex,
                              ),
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                {blocks.length > 8 && (
                  <div className="inline-warning" role="status">
                    {t(
                      "Kartınızda 8’ten fazla blok bulunuyor. En kritik profil, iletişim ve aksiyon bloklarını üst bölümde tutmanız önerilir.",
                    )}
                  </div>
                )}
              </div>
              <div
                className="card-builder-preview"
                aria-label={t("Canlı önizleme")}
              >
                <PublicCard
                  token="editor-preview"
                  onReport={() => {}}
                  previewCard={previewCard}
                />
                <small>
                  {t("Canlı önizleme")} ·{" "}
                  {form.presentation_mode === "classic"
                    ? "Classic NFC"
                    : form.presentation_mode === "smart"
                      ? "Smart NFC"
                      : "Showcase NFC"}
                  {isDirty ? ` · ${t("Kaydedilmemiş değişiklikler")}` : ""}
                </small>
              </div>
            </div>
          </div>
          <div className="form-section palette-section">
            <div className="section-heading-row">
              <h3>
                03 <span>{t("Tema ve Renkler")}</span>
              </h3>
            </div>
            <p className="field-hint">
              {t(
                "Kartınız için bir tema seçin. Renkler canlı önizlemede hemen uygulanır.",
              )}
            </p>
            {paletteError && (
              <div className="inline-warning" role="alert">
                {paletteError}
              </div>
            )}
            {suggestedPalette && !form.palette_id && (
              <div className="palette-suggestion" role="status">
                {t("Bu blok için önerilen tema")}:{" "}
                <strong>{t(suggestedPalette.name)}</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const matchingPalette = palettes.find((palette) =>
                      palette.name
                        .toLocaleLowerCase("tr")
                        .includes(
                          suggestedPalette.name.toLocaleLowerCase("tr"),
                        ),
                    );
                    if (matchingPalette)
                      update("palette_id", matchingPalette.id);
                    else setSuggestedPalette(null);
                  }}
                >
                  {t("Uygula")}
                </button>
              </div>
            )}
            <div className="palette-grid" aria-label={t("Renk paletleri")}>
              {paletteLoading ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {palettes.map((palette) => {
                    const selected = form.palette_id === palette.id;
                    return (
                      <button
                        type="button"
                        className={`palette-option ${selected ? "selected" : ""}`}
                        key={palette.id}
                        aria-pressed={selected}
                        onClick={() => {
                          update("palette_id", palette.id);
                          setSuggestedPalette(null);
                        }}
                      >
                        <span className="palette-swatches" aria-hidden="true">
                          <i
                            style={{
                              backgroundColor: palette.tokens?.background,
                            }}
                          />
                          <i
                            style={{ backgroundColor: palette.tokens?.primary }}
                          />
                        </span>
                        <span>
                          <strong>{palette.name}</strong>
                          <small>
                            {palette.moderation_status === "pending"
                              ? t("İnceleniyor")
                              : paletteContrastIssues(palette.tokens).length
                                ? t("Kontrastı düşük")
                                : t("Erişilebilir kontrast")}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`palette-option palette-default-option ${!form.palette_id ? "selected" : ""}`}
                    aria-pressed={!form.palette_id}
                    onClick={() => {
                      update("palette_id", null);
                      setSuggestedPalette(null);
                    }}
                  >
                    <span className="palette-swatches" aria-hidden="true">
                      <i style={{ backgroundColor: "#0F172A" }} />
                      <i style={{ backgroundColor: "#38BDF8" }} />
                    </span>
                    <span>
                      <strong>{t("Sistem varsayılanı")}</strong>
                      <small>{t("Otomatik tema")}</small>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="custom-palette-controls">
            <button
              type="button"
              className="button button-secondary custom-palette-toggle"
              onClick={openCustomPaletteEditor}
              aria-expanded={customPaletteOpen}
            >
              <Plus size={15} />
              {t("Özel Renk Paleti Oluştur")}
            </button>
            {customPaletteOpen && (
              <div
                className="custom-palette-editor"
                role="group"
                aria-label={t("Özel renk paleti")}
              >
                <label className="field">
                  <span>{t("Palet adı")}</span>
                  <input
                    value={customPaletteName}
                    maxLength={80}
                    onChange={(event) =>
                      setCustomPaletteName(event.target.value)
                    }
                    placeholder={t("Örn. Marka renklerim")}
                  />
                </label>
                <div className="custom-color-grid">
                  {[
                    ["background", "Arka Plan"],
                    ["surface", "Kart Yüzeyi"],
                    ["text", "Ana Yazı Rengi"],
                    ["primary", "Vurgu & Buton Rengi"],
                    ["muted", "İkincil / Sönük Yazı"],
                    ["accent", "İkincil Vurgu"],
                  ].map(([token, label]) => (
                    <label className="custom-color-field" key={token}>
                      <span>{t(label)}</span>
                      <input
                        type="color"
                        value={customPaletteTokens[token]}
                        onChange={(event) =>
                          updateCustomPaletteToken(token, event.target.value)
                        }
                        aria-label={t(label)}
                      />
                      <input
                        type="text"
                        value={customPaletteTokens[token]}
                        maxLength={7}
                        pattern="#[0-9A-Fa-f]{6}"
                        onChange={(event) =>
                          updateCustomPaletteToken(token, event.target.value)
                        }
                        aria-label={`${t(label)} hex`}
                      />
                    </label>
                  ))}
                </div>
                <label className="custom-color-field">
                  <span>{t("Buton yazısı")}</span>
                  <input
                    type="color"
                    value={customPaletteTokens.button_text}
                    onChange={(event) =>
                      updateCustomPaletteToken(
                        "button_text",
                        event.target.value,
                      )
                    }
                    aria-label={t("Buton yazısı")}
                  />
                  <input
                    type="text"
                    value={customPaletteTokens.button_text}
                    maxLength={7}
                    pattern="#[0-9A-Fa-f]{6}"
                    onChange={(event) =>
                      updateCustomPaletteToken(
                        "button_text",
                        event.target.value,
                      )
                    }
                    aria-label={`${t("Buton yazısı")} hex`}
                  />
                </label>
                <div className="custom-palette-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={async () => {
                      try {
                        await saveEditedPalette();
                      } catch (paletteSaveError) {
                        setPaletteError(
                          paletteSaveError.message ||
                            t("Özel palet kaydedilemedi."),
                        );
                      }
                    }}
                  >
                    {t("Paleti kaydet")}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setCustomPaletteOpen(false)}
                  >
                    {t("Kapat")}
                  </button>
                </div>
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="form-section admin-card-fields">
              <h3>
                <ShieldCheck size={15} />{" "}
                <span>{t("04 Yönetici / bayi yönetimi")}</span>
              </h3>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(form.managed_by_admin)}
                  onChange={(event) => {
                    update("managed_by_admin", event.target.checked);
                    if (event.target.checked)
                      update("user_id", form.user_id || user.id);
                    else update("user_id", user.id);
                  }}
                />
                <span>{t("Müşteri için yönetilen kart")}</span>
              </label>
              {form.managed_by_admin && (
                <>
                  <label className="field">
                    <span>{t("Müşteri profili")}</span>
                    <select
                      value={form.user_id || user.id}
                      onChange={(event) =>
                        update("user_id", event.target.value)
                      }
                    >
                      <option value={user.id}>
                        {t("Merkezi yönetim (admin)")}
                      </option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.full_name ||
                            client.email ||
                            client.phone ||
                            client.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t("Yalnızca yönetici notu")}</span>
                    <textarea
                      value={form.client_notes || ""}
                      onChange={(event) =>
                        update("client_notes", event.target.value)
                      }
                      maxLength={5000}
                      placeholder={t(
                        "Ödeme, iletişim veya fiziksel konum notları",
                      )}
                    />
                  </label>
                </>
              )}
            </div>
          )}
          <div className="form-section" id="editor-nfc">
            <h3>
              05 <span>{t("NFC")}</span>
            </h3>
            <label className="check-row nfc-check">
              <input
                type="checkbox"
                checked={Boolean(form.nfc_active)}
                disabled={!canSkipScan}
                onChange={(event) => update("nfc_active", event.target.checked)}
              />
              <span>{t("NFC etiketi aktif")}</span>
            </label>
            {!canSkipScan && (
              <p className="field-hint">
                {t("NFC durumunu yalnızca yönetici değiştirebilir.")}
              </p>
            )}
          </div>
          <div className="scan-status">
            {scanning ? (
              <>
                <LoaderCircle className="spin" size={15} />{" "}
                {t("Bağlantılar güvenlik kontrolünden geçiriliyor…")}
              </>
            ) : (
              <>
                <ShieldCheck size={15} />{" "}
                {t("Harici bağlantılar güvenlik ve onay kurallarına tabidir.")}
              </>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={requestClose}
            >
              {t("Vazgeç")}
            </button>
            <button
              className="button button-primary"
              disabled={busy || !supabaseConfigured}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : null}
              {card ? t("Değişiklikleri kaydet") : t("Kartı oluştur")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Sidebar({
  section,
  onSection,
  onSignOut,
  user,
  mobileOpen,
  onClose,
  dark,
  onToggleTheme,
  isAdmin,
  canManageUsers,
  pendingReports,
}) {
  const { t } = useTranslation();
  const roleLabel = user.is_super_user
    ? t("Süper yönetici")
    : isAdmin
      ? user.role === "admin"
        ? t("Yönetici")
        : t("Bayi")
      : t("Doğrulanmış kullanıcı");
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Menüyü kapat"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#">
            <span className="brand-symbol">b.</span>
            <span>bilgi</span>
          </a>
          <span className="workspace-pill">DASHBOARD</span>
        </div>
        <div className="workspace-card">
          <div className="workspace-avatar">
            {(user.user_metadata?.full_name || user.email || "B")
              .slice(0, 1)
              .toLocaleUpperCase("tr")}
          </div>
          <div>
            <strong>
              {user.user_metadata?.full_name || t("İşletme hesabım")}
            </strong>
            <small>{roleLabel}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-caption">{t("MENÜ")}</p>
        <nav className="side-nav" aria-label="Ana menü">
          <button
            className={section === "overview" ? "selected" : ""}
            onClick={() => onSection("overview")}
          >
            <LayoutDashboard size={17} /> {t("Genel Bakış")}
          </button>
          <button
            className={section === "cards" ? "selected" : ""}
            onClick={() => onSection("cards")}
          >
            <Smartphone size={17} /> {t("Kartlarım")}
          </button>
          <button
            className={section === "feedback" ? "selected" : ""}
            onClick={() => onSection("feedback")}
          >
            <FileText size={17} /> {t("Geri bildirimler")}
          </button>
          {isAdmin && (
            <button
              className={section === "abuse" ? "selected" : ""}
              onClick={() => onSection("abuse")}
            >
              <ShieldCheck size={17} /> {t("Kötüye kullanım bildirimleri")}{" "}
              {pendingReports > 0 && (
                <span className="nav-count-badge">{pendingReports}</span>
              )}
            </button>
          )}
          {canManageUsers && (
            <button
              className={section === "users" ? "selected" : ""}
              onClick={() => onSection("users")}
            >
              <Users size={17} /> {t("Kullanıcı yönetimi")}
            </button>
          )}
          {canManageUsers && (
            <button
              className={section === "audit" ? "selected" : ""}
              onClick={() => onSection("audit")}
            >
              <FileText size={17} /> {t("Denetim günlüğü")}
            </button>
          )}
          {canManageUsers && (
            <button
              className={section === "allowlist" ? "selected" : ""}
              onClick={() => onSection("allowlist")}
            >
              <ShieldCheck size={17} /> {t("Güvenli alan adları")}
            </button>
          )}
        </nav>
        <p className="nav-caption nav-caption-lower">{t("HESAP")}</p>
        <nav className="side-nav">
          <button
            className={section === "settings" ? "selected" : ""}
            onClick={() => onSection("settings")}
          >
            <Settings size={17} /> {t("Ayarlar")}
          </button>
          <button onClick={onToggleTheme}>
            <span className="nav-icon">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </span>
            {dark ? t("Açık tema") : t("Koyu tema")}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <CircleHelp size={18} />
            </span>
            <strong>{t("Yardıma mı ihtiyacınız var?")}</strong>
            <p>{t("Ekibimiz size yardımcı olmaya hazır.")}</p>
            <a href="mailto:destek@openstacktool.com">
              {t("Destek ile iletişime geç")} <ArrowUpRight size={13} />
            </a>
          </div>
          <button className="profile-row" onClick={onSignOut}>
            <span className="profile-avatar">
              {(user.user_metadata?.full_name || user.email || "B")
                .slice(0, 1)
                .toLocaleUpperCase("tr")}
            </span>
            <span className="profile-info">
              <strong>{user.user_metadata?.full_name || "Hesabım"}</strong>
              <small>{user.email || user.phone}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

function CardRow({
  card,
  onEdit,
  onDelete,
  onViewFeedback,
  onNotify,
  isAdmin = false,
  canApprove = false,
  onApprove,
  onModerate,
  onToggleActive,
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const url = cardUrl(card);
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      onNotify(t("Kart bağlantısı panoya kopyalandı."));
    } catch {
      onNotify(
        t("Bağlantı kopyalanamadı. Tarayıcı izinlerini kontrol edin."),
        true,
      );
    }
  }
  return (
    <article className="card-row">
      <div
        className={`card-type-icon ${card.type === "iban_card" ? "type-iban" : ""}`}
      >
        <Smartphone size={18} />
      </div>
      <div className="card-main">
        <div className="card-name-row">
          <h3>{card.title}</h3>
          <span
            className={`status-badge ${card.status === "pending_approval" ? "status-pending" : card.status === "rejected" ? "status-rejected" : card.status === "suspended" ? "status-suspended" : card.status === "deleted" ? "status-deleted" : card.access_mode === "public" ? "status-public" : "status-private"}`}
          >
            <i />
            {card.status === "pending_approval"
              ? t("Onay bekliyor")
              : card.status === "rejected"
                ? t("Kart reddedildi")
                : card.status === "suspended"
                  ? t("Askıya alındı")
                  : card.status === "deleted"
                    ? t("Arşivlendi")
                    : card.access_mode === "public"
                      ? t("Herkese açık")
                      : t("Gizli")}
          </span>
        </div>
        <p>
          {t("Dijital kart")} <span>·</span>{" "}
          {card.nfc_active ? t("NFC aktif") : t("NFC kapalı")}
          {isAdmin && card.managed_by_admin && (
            <>
              {" "}
              <span>·</span> {t("Yönetilen müşteri kartı")}
            </>
          )}
          {!card.is_active && (
            <>
              {" "}
              <span>·</span>{" "}
              <strong className="inactive-label">{t("Donduruldu")}</strong>
            </>
          )}
        </p>
        {isAdmin && card.client_notes && (
          <small className="admin-note">
            {t("Yönetici notu")}: {card.client_notes}
          </small>
        )}
        <span className="card-url">{url.replace(/^https?:\/\//, "")}</span>
      </div>
      <div className="card-actions">
        {canApprove && card.status === "pending_approval" && (
          <button
            className="button button-primary"
            onClick={() => onApprove(card)}
          >
            <Check size={14} /> {t("Kartı onayla")}
          </button>
        )}
        {card.status === "active" && card.is_active && (
          <>
            <a
              className="button button-quiet"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} /> {t("Görüntüle")}
            </a>
            <button
              className="button button-quiet copy-action"
              onClick={copyUrl}
            >
              <Copy size={14} /> {t("Bağlantıyı kopyala")}
            </button>
          </>
        )}
        <button
          className="button button-quiet edit-action"
          onClick={() => onEdit(card)}
        >
          {t("Düzenle")}
        </button>
        {isAdmin && (
          <IconButton
            label={t(card.is_active ? "Kartı dondur" : "Kartı etkinleştir")}
            className={`active-toggle ${card.is_active ? "" : "is-frozen"}`}
            onClick={() => onToggleActive(card)}
          >
            <ShieldCheck size={16} />
          </IconButton>
        )}
        <div className="menu-wrap">
          <IconButton
            label={t("Diğer işlemler")}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreHorizontal size={18} />
          </IconButton>
          {menuOpen && (
            <div className="action-menu">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onViewFeedback(card);
                }}
              >
                <FileText size={15} /> {t("Geri bildirimler")}
              </button>
              {canApprove &&
                card.status !== "deleted" &&
                card.status !== "active" && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onModerate(card, "active");
                    }}
                  >
                    <Check size={15} /> {t("Yeniden yayınla")}
                  </button>
                )}
              {canApprove && card.status === "pending_approval" && (
                <button
                  className="menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onModerate(card, "rejected");
                  }}
                >
                  <X size={15} /> {t("Reddet")}
                </button>
              )}
              {canApprove && card.status === "active" && (
                <button
                  className="menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onModerate(card, "suspended");
                  }}
                >
                  <ShieldCheck size={15} /> {t("Askıya al")}
                </button>
              )}
              {canApprove && card.status !== "deleted" && (
                <button
                  className="menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onModerate(card, "deleted");
                  }}
                >
                  <Trash2 size={15} /> {t("Arşivle")}
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(card);
                }}
              >
                <Settings size={15} /> {t("Kartı düzenle")}
              </button>
              <button
                className="menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(card);
                }}
              >
                <Trash2 size={15} /> {t("Kartı sil")}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function OnboardingModal({ busy, error, onChoose, onSkip }) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section
        className="modal onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="onboarding-heading">
          <p className="eyebrow">{t("HESABINIZI HAZIRLAYIN")}</p>
          <h2 id="onboarding-title">
            {t("Bilgi NFC'yi en çok nasıl kullanacaksınız?")}
          </h2>
          <p>
            {t(
              "Bu, deneyiminizi kişiselleştirmemize yardımcı olur. İsterseniz daha sonra da yanıtlayabilirsiniz.",
            )}
          </p>
        </div>
        <div className="onboarding-options">
          <button
            type="button"
            className="onboarding-option"
            disabled={busy}
            onClick={() => onChoose("personal_freelancer")}
          >
            <span className="choice-icon">
              <UserRound size={18} />
            </span>
            <strong>{t("Kişisel / Serbest çalışan")}</strong>
          </button>
          <button
            type="button"
            className="onboarding-option"
            disabled={busy}
            onClick={() => onChoose("business_enterprise")}
          >
            <span className="choice-icon">
              <Globe2 size={18} />
            </span>
            <strong>{t("İşletme / Kurumsal")}</strong>
          </button>
        </div>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <button
          type="button"
          className="button button-secondary onboarding-skip"
          disabled={busy}
          onClick={onSkip}
        >
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {t("Şimdilik geç")}
        </button>
      </section>
    </div>
  );
}

function GoogleConsentModal({ status, error, onRetry, onConfirm }) {
  const { t, language } = useTranslation();
  const legalLinks = legalLinksByLanguage[language] || legalLinksByLanguage.en;
  const [accepted, setAccepted] = useState(false);
  const busy = status === "saving";
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section
        className="modal google-consent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-consent-title"
      >
        <div className="onboarding-heading">
          <p className="eyebrow">{t("HESABINIZI HAZIRLAYIN")}</p>
          <h2 id="google-consent-title">{t("Yasal koşulları onaylayın")}</h2>
          <p>
            {t(
              "Hesabınızı kullanmadan önce Kullanım Koşulları ve Gizlilik Politikası'nı inceleyip onaylamanız gerekir.",
            )}
          </p>
        </div>
        {status === "checking" ? (
          <p className="consent-checking">
            <LoaderCircle className="spin" size={18} />{" "}
            {t("Onay durumunuz kontrol ediliyor…")}
          </p>
        ) : status === "error" ? (
          <>
            <div className="inline-error" role="alert">
              {error}
            </div>
            <button
              className="button button-primary button-wide"
              type="button"
              onClick={onRetry}
            >
              {t("Yeniden dene")}
            </button>
          </>
        ) : (
          <>
            <label className="check-row google-consent-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={busy}
              />
              <span>
                {t("Şunları kabul ediyorum:")}{" "}
                <a href={legalLinks[0].href} target="_blank" rel="noreferrer">
                  {t("Kullanım Koşulları")}
                </a>{" "}
                {t("ve")}{" "}
                <a href={legalLinks[1].href} target="_blank" rel="noreferrer">
                  {t("Gizlilik Politikası")}
                </a>
                .{" "}
                {t(
                  "En az 18 yaşında olduğumu veya ülkemdeki yasal asgari yaş şartını karşıladığımı onaylıyorum.",
                )}{" "}
                <b>*</b>
              </span>
            </label>
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button button-primary button-wide"
              type="button"
              disabled={!accepted || busy}
              onClick={onConfirm}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : null}
              {t("Kabul et ve devam et")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function App() {
  const { t, language } = useTranslation();
  const [routeLocation, setRouteLocation] = useState(window.location.pathname);
  const pathname = routeLocation;
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const publicMatch = normalizedPath.match(/^\/(c|p)\/([^/]+)$/);
  const legacyCardRoute = normalizedPath === "/informationpage";
  const legacyCardKey = legacyCardRoute
    ? new URLSearchParams(window.location.search).get("id") ||
      new URLSearchParams(window.location.search).get("token") ||
      new URLSearchParams(window.location.search).get("slug")
    : null;
  const slugMatch = normalizedPath.match(/^\/([^/]+)$/);
  const publicSlug =
    slugMatch &&
    !reservedRoutes.has(decodeRouteSegment(slugMatch[1]).toLowerCase())
      ? decodeRouteSegment(slugMatch[1])
      : null;
  const legalRoute =
    legalRouteDocuments[normalizedPath] ||
    legacyLegalRouteDocuments[normalizedPath];
  const legalRouteTarget = legalRoute
    ? getLegalRouteTarget(legalRoute[0], legalRoute[1])
    : null;
  const loginRoute = normalizedPath === "/login";
  const createRoute = normalizedPath === "/create";
  const devEditorPreviewRoute =
    import.meta.env.DEV &&
    ["/__dev/card-editor", "/__dev/card-create"].includes(normalizedPath);
  const editorRouteMatch = normalizedPath.match(/^\/dashboard\/cards\/([^/]+)\/edit$/);
  const editorCardId = editorRouteMatch ? decodeRouteSegment(editorRouteMatch[1]) : null;
  const editorRoute = Boolean(editorCardId);
  const adminRoute = normalizedPath === "/admin";
  const dashboardRoute = /^\/dashboard(?:\/.*)?$/.test(normalizedPath);
  const settingsRoute = /^\/settings(?:\/.*)?$/.test(normalizedPath);
  const protectedRoute =
    createRoute || adminRoute || dashboardRoute || settingsRoute;
  const authRoute = protectedRoute || loginRoute;
  const cardKey = publicMatch
    ? decodeRouteSegment(publicMatch[2])
    : legacyCardKey || publicSlug;
  const [session, setSession] = useState(null);
  const activeOwnerId = useRef(null);
  const [authReady, setAuthReady] = useState(!authRoute || !supabaseConfigured);
  const [authNotice, setAuthNotice] = useState("");
  const [cards, setCards] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [profile, setProfile] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [googleConsentStatus, setGoogleConsentStatus] =
    useState("not-required");
  const [googleConsentError, setGoogleConsentError] = useState("");
  const [clients, setClients] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersPage, setAdminUsersPage] = useState(1);
  const [adminUsersHasMore, setAdminUsersHasMore] = useState(false);
  const [adminUsersBusy, setAdminUsersBusy] = useState(false);
  const [adminUserCounts, setAdminUserCounts] = useState({
    total: 0,
    active: 0,
  });
  const [auditEvents, setAuditEvents] = useState([]);
  const [scanDomains, setScanDomains] = useState([]);
  const [scanDomainInput, setScanDomainInput] = useState("");
  const [scanDomainBusy, setScanDomainBusy] = useState(false);
  const canManageUsers =
    profile?.role === "admin" || profile?.is_super_user === true;
  const [abuseReports, setAbuseReports] = useState([]);
  const [section, setSection] = useState(
    settingsRoute ? "settings" : "overview",
  );
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
  const [dark, setDark] = useState(
    () => localStorage.getItem("bilgi-theme") !== "light",
  );
  useEffect(() => {
    const syncRoute = () => {
      const nextPath = window.location.pathname;
      setRouteLocation(nextPath);
      if (!/^\/dashboard\/cards\/[^/]+\/edit\/?$/.test(nextPath))
        setModalCard(undefined);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (!editorRoute || loading) return;
    const matchingCard = cards.find((item) => item.id === editorCardId);
    if (matchingCard) {
      setModalCard((current) => current?.id === matchingCard.id ? current : matchingCard);
    }
  }, [cards, editorCardId, editorRoute, loading]);
  function openReport(context = {}) {
    setReportContext({
      ...context,
      reportedUrl: context.reportedUrl || window.location.href,
    });
  }

  function updateCardsState(updater) {
    invalidateCachedQueries(["cards", "list"]);
    setCards(updater);
  }

  function setAppPath(path, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setRouteLocation(window.location.pathname);
  }

  function openCardEditor(card) {
    setModalCard(card);
    setStartManagedCard(false);
    setAppPath(`/dashboard/cards/${encodeURIComponent(card.id)}/edit`);
  }

  function closeCardEditor(nextSection = "cards") {
    setModalCard(undefined);
    setSection(nextSection);
    setAppPath("/dashboard", true);
  }

  useEffect(() => {
    const nextOwnerId = session?.user?.id || null;
    if (activeOwnerId.current !== nextOwnerId) {
      setCards([]);
      setFeedback([]);
      setFeedbackTotal(0);
      setProfile(null);
      setClients([]);
      setAbuseReports([]);
      setLoading(Boolean(nextOwnerId));
      setError("");
    }
    activeOwnerId.current = nextOwnerId;
  }, [session]);

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
        setAuthNotice(
          t(
            "E-posta adresinizi doğrulamanız gerekiyor. Lütfen etkinleştirme bağlantısını kullanın.",
          ),
        );
        void supabase.auth.signOut();
      } else {
        setSession(data.session);
        setGoogleConsentStatus(
          isGoogleAuthSession(data.session) ? "checking" : "not-required",
        );
        if (data.session) setAuthNotice("");
      }
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (nextSession && !isVerifiedAuthSession(nextSession)) {
          setSession(null);
          setGoogleConsentStatus("not-required");
          setAuthNotice(
            t(
              "E-posta adresinizi doğrulamanız gerekiyor. Lütfen etkinleştirme bağlantısını kullanın.",
            ),
          );
          window.queueMicrotask(() => {
            void supabase.auth.signOut();
          });
        } else {
          setSession(nextSession);
          setGoogleConsentStatus(
            isGoogleAuthSession(nextSession) ? "checking" : "not-required",
          );
          if (nextSession) setAuthNotice("");
        }
        setAuthReady(true);
      },
    );
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
    if (
      !session ||
      !supabase ||
      !isGoogleAuthSession(session) ||
      googleConsentStatus !== "checking"
    )
      return undefined;
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
      setGoogleConsentError(
        consentError.message || t("Onay durumu kontrol edilemedi."),
      );
      setGoogleConsentStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [session, googleConsentStatus, t]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadData({ force = false } = {}) {
    if (!supabase || !session) return;
    setLoading(true);
    setError("");
    const ownerId = session.user.id;
    const profileKey = ["profile", ownerId];
    const cardsKey = ["cards", "list", { userId: ownerId }];
    const clientsKey = ["clients", ownerId];
    const reportsKey = ["reports", ownerId];
    const cachedRequest = (key, staleTime, request) =>
      queryCached(
        key,
        staleTime,
        async () => {
          const result = await request();
          if (result.error)
            console.error("Dashboard query failed", result.error);
          return result;
        },
        { force },
      );
    const profileResult = await cachedRequest(profileKey, 60_000, () =>
      supabase
        .from("profiles")
        .select(
          "id,role,is_super_user,is_suspended,full_name,email,phone,marketing_opt_in,account_type,onboarding_completed",
        )
        .eq("id", ownerId)
        .maybeSingle(),
    );
    const { data: profileData, error: profileError } = profileResult;
    setProfile(profileData || null);
    if (!profileError && profileData)
      setOnboardingOpen(!profileData.onboarding_completed);
    const hasAdminAccess = isAdminProfile(profileData);
    const privilegedFeedbackAccess = isSuperAdminProfile(profileData);
    const feedbackKey = [
      "feedbacks",
      privilegedFeedbackAccess ? "admin" : "owner",
      { userId: ownerId },
    ];
    const [cardsResult, feedbackResult, clientsResult, reportsResult] =
      await Promise.all([
        cachedRequest(cardsKey, 60_000, () =>
          supabase
            .from("nfc_cards")
            .select(
              "id,user_id,type,access_mode,slug,access_token,title,google_review_url,whatsapp,sms,instagram_url,email,iban,bank_name,extra_links,blocks,nfc_active,is_active,status,managed_by_admin,client_notes,rejection_reason,created_at,updated_at",
            )
            .order("created_at", { ascending: false }),
        ),
        cachedRequest(feedbackKey, 60_000, () =>
          supabase.rpc(
            privilegedFeedbackAccess
              ? "get_admin_card_feedback"
              : "get_card_feedback",
          ),
        ),
        hasAdminAccess
          ? cachedRequest(clientsKey, 60_000, () =>
              supabase
                .from("profiles")
                .select("id,full_name,email,phone")
                .eq("role", "user")
                .order("full_name"),
            )
          : Promise.resolve({ data: [], error: null }),
        hasAdminAccess
          ? cachedRequest(reportsKey, 30_000, () =>
              supabase
                .from("abuse_reports")
                .select(
                  "id,card_id,reported_url,reporter_email,reason_category,details,status,created_at",
                )
                .order("created_at", { ascending: false })
                .limit(250),
            )
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (activeOwnerId.current !== ownerId) return;
    if (profileError || !profileData) {
      setError(
        profileError
          ? `${t("Profil yüklenemedi: {error}", { error: profileError.message })}`
          : t(
              "Kullanıcı profili bulunamadı. Lütfen veritabanı şemasını uygulayın.",
            ),
      );
    }
    if (cardsResult.error)
      setError(`Kartlar yüklenemedi: ${cardsResult.error.message}`);
    else setCards((cardsResult.data || []).map(hydrateCardFromBlocks));
    if (feedbackResult.error) {
      if (feedbackResult.error.code !== "42883") {
        setError((previous) =>
          [
            previous,
            `Geri bildirimler yüklenemedi: ${feedbackResult.error.message}`,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      setFeedback([]);
      setFeedbackTotal(0);
    } else {
      const feedbackRows = (feedbackResult.data || []).map((item) => ({
        ...item,
        customer_message: item.message,
      }));
      setFeedback(feedbackRows);
      setFeedbackTotal(feedbackRows.length);
    }
    if (clientsResult.error) {
      setError((previous) =>
        [
          previous,
          t("Müşteri profilleri yüklenemedi: {error}", {
            error: clientsResult.error.message,
          }),
        ]
          .filter(Boolean)
          .join(" "),
      );
      setClients([]);
    } else setClients(clientsResult.data || []);
    if (reportsResult.error) {
      setError((previous) =>
        [
          previous,
          t("Kötüye kullanım bildirimleri yüklenemedi: {error}", {
            error: reportsResult.error.message,
          }),
        ]
          .filter(Boolean)
          .join(" "),
      );
      setAbuseReports([]);
    } else setAbuseReports(reportsResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (
      protectedRoute &&
      session &&
      (!isGoogleAuthSession(session) || googleConsentStatus === "done")
    ) {
      loadData().catch((loadError) => {
        console.error("Dashboard data load failed", loadError);
        setError(t("Dashboard verileri geçici olarak yüklenemedi."));
        setLoading(false);
      });
    }
  }, [session, protectedRoute, googleConsentStatus]);

  useEffect(() => {
    if (!adminRoute || !session || loading) return;
    if (canManageUsers) {
      setSection("users");
      return;
    }
    window.history.replaceState({}, "", "/dashboard");
    setSection("overview");
    setToast({ message: t("Yönetici yetkisi gerekiyor."), bad: true });
  }, [adminRoute, canManageUsers, loading, profile, session, t]);

  async function loadAdminUsers(page = 1, append = false) {
    if (!supabase || !canManageUsers) return;
    setAdminUsersBusy(true);
    try {
      const { data, error: usersError } = await supabase.functions.invoke(
        "admin-users",
        {
          body: { action: "list", page },
        },
      );
      if (usersError) throw usersError;
      if (!data || !Array.isArray(data.users))
        throw new Error(t("Kullanıcı listesi yanıtı geçersiz."));
      setAdminUsers((current) =>
        append ? [...current, ...data.users] : data.users,
      );
      setAdminUsersPage(page);
      setAdminUsersHasMore(data.hasMore === true);
      setAdminUserCounts({
        total: data.totalUsers || 0,
        active: data.activeUsers || 0,
      });
    } finally {
      setAdminUsersBusy(false);
    }
  }

  async function setAdminUserSuspended(targetUser, suspended) {
    try {
      const { error: statusError } = await supabase.functions.invoke(
        "admin-users",
        {
          body: { action: "set_status", userId: targetUser.id, suspended },
        },
      );
      if (statusError) throw statusError;
      setAdminUsers((current) =>
        current.map((item) =>
          item.id === targetUser.id
            ? { ...item, is_suspended: suspended }
            : item,
        ),
      );
      setAdminUserCounts((current) => ({
        ...current,
        active: Math.max(0, current.active + (suspended ? -1 : 1)),
      }));
      setToast({
        message: t(
          suspended
            ? "Kullanıcı askıya alındı."
            : "Kullanıcı yeniden etkinleştirildi.",
        ),
      });
    } catch (statusError) {
      setToast({
        message: statusError.message || t("Kullanıcı durumu güncellenemedi."),
        bad: true,
      });
    }
  }

  useEffect(() => {
    if (section === "users" && canManageUsers) {
      loadAdminUsers().catch((usersError) =>
        setToast({
          message: usersError.message || t("Kullanıcı listesi yüklenemedi."),
          bad: true,
        }),
      );
    }
  }, [section, canManageUsers]);

  useEffect(() => {
    if (section === "overview" && canManageUsers) {
      loadAdminUsers().catch((usersError) =>
        setToast({
          message: usersError.message || t("Kullanıcı listesi yüklenemedi."),
          bad: true,
        }),
      );
    }
  }, [section, canManageUsers]);

  useEffect(() => {
    if (section !== "audit" || !canManageUsers) return;
    supabase
      .from("admin_audit_log")
      .select(
        "id,actor_user_id,action,entity_type,entity_id,changed_fields,old_status,new_status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(250)
      .then(({ data, error: auditError }) => {
        if (auditError) setToast({ message: auditError.message, bad: true });
        else setAuditEvents(data || []);
      });
  }, [section, canManageUsers]);

  async function loadScanDomains() {
    const { data, error: allowlistError } = await supabase
      .from("url_scan_allowlist")
      .select("domain,created_at")
      .order("domain");
    if (allowlistError) throw allowlistError;
    setScanDomains(data || []);
  }

  useEffect(() => {
    if (section === "allowlist" && canManageUsers) {
      loadScanDomains().catch((allowlistError) =>
        setToast({ message: allowlistError.message, bad: true }),
      );
    }
  }, [section, canManageUsers]);

  async function saveScanDomain(event) {
    event.preventDefault();
    const domain = scanDomainInput.trim().toLowerCase();
    if (
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
        domain,
      )
    ) {
      setToast({ message: t("Etki alanı biçimi geçersiz."), bad: true });
      return;
    }
    setScanDomainBusy(true);
    try {
      const { error: insertError } = await supabase
        .from("url_scan_allowlist")
        .insert({
          domain,
          created_by: session.user.id,
        });
      if (insertError) throw insertError;
      setScanDomainInput("");
      setToast({ message: t("Güvenli etki alanı eklendi.") });
      await loadScanDomains();
    } catch (allowlistError) {
      setToast({
        message: allowlistError.message || t("Güvenli etki alanı eklenemedi."),
        bad: true,
      });
    } finally {
      setScanDomainBusy(false);
    }
  }

  async function removeScanDomain(domain) {
    setScanDomainBusy(true);
    try {
      const { error: deleteError } = await supabase
        .from("url_scan_allowlist")
        .delete()
        .eq("domain", domain);
      if (deleteError) throw deleteError;
      setScanDomains((current) =>
        current.filter((item) => item.domain !== domain),
      );
      setToast({ message: t("Güvenli etki alanı kaldırıldı.") });
    } catch (allowlistError) {
      setToast({
        message:
          allowlistError.message || t("Güvenli etki alanı kaldırılamadı."),
        bad: true,
      });
    } finally {
      setScanDomainBusy(false);
    }
  }

  async function acceptGoogleConsent() {
    if (!supabase || !session || !isGoogleAuthSession(session)) return;
    setGoogleConsentStatus("saving");
    setGoogleConsentError("");
    const acceptedAt = new Date().toISOString();
    try {
      const { error: consentError } = await supabase
        .from("consent_records")
        .upsert(
          {
            user_id: session.user.id,
            terms_accepted_at: acceptedAt,
            kvkk_consent_at: acceptedAt,
            age_confirmed_at: acceptedAt,
          },
          { onConflict: "user_id" },
        );
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
      setGoogleConsentError(
        consentError.message || t("Yasal onayınız kaydedilemedi."),
      );
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
      const { error: updateError } = await supabase.auth.updateUser({
        data: metadata,
      });
      if (updateError) throw updateError;
      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id,role,is_super_user,full_name,email,phone,marketing_opt_in,account_type,onboarding_completed",
        )
        .eq("id", session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!updatedProfile)
        throw new Error(t("Onboarding tercihiniz kaydedilemedi."));
      setProfile(updatedProfile);
      setOnboardingOpen(false);
    } catch (onboardingSaveError) {
      setOnboardingError(
        onboardingSaveError.message ||
          t("Onboarding tercihiniz kaydedilemedi."),
      );
    } finally {
      setOnboardingBusy(false);
    }
  }

  function handleAuthenticated(nextSession) {
    setSession(nextSession);
    setGoogleConsentStatus(
      isGoogleAuthSession(nextSession) ? "checking" : "not-required",
    );
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
    try {
      const { error: deleteError } = await supabase
        .from("nfc_cards")
        .delete()
        .eq("id", card.id);
      if (deleteError) throw deleteError;
      updateCardsState((current) =>
        current.filter((item) => item.id !== card.id),
      );
      invalidateCachedQueries(["feedbacks"]);
      setFeedback((current) =>
        current.filter((item) => item.card_id !== card.id),
      );
      setFeedbackTotal((current) =>
        Math.max(
          0,
          current - feedback.filter((item) => item.card_id === card.id).length,
        ),
      );
      setDeleteCardTarget(null);
      setToast({ message: t("Kart silindi.") });
    } catch (deleteError) {
      console.error("Card deletion failed", deleteError);
      setToast({
        message: t("Kart silinemedi. Lütfen tekrar deneyin."),
        bad: true,
      });
    } finally {
      setDeletingCard(false);
    }
  }

  async function toggleCardActive(card) {
    const nextActive = !card.is_active;
    const { error: updateError } = await supabase
      .from("nfc_cards")
      .update({ is_active: nextActive })
      .eq("id", card.id);
    if (updateError) {
      setToast({
        message: t("Kart durumu güncellenemedi: {error}", {
          error: updateError.message,
        }),
        bad: true,
      });
      return;
    }

    updateCardsState((current) =>
      current.map((item) =>
        item.id === card.id ? { ...item, is_active: nextActive } : item,
      ),
    );
    setToast({
      message: nextActive
        ? t("Kart yeniden etkinleştirildi.")
        : t("Kart geçici olarak donduruldu."),
    });
  }

  async function approveCard(card) {
    if (!supabase || !(profile?.role === "admin" || profile?.is_super_user))
      return;
    const { data, error: approvalError } = await supabase
      .from("nfc_cards")
      .update({ status: "active" })
      .eq("id", card.id)
      .select()
      .single();
    if (approvalError) {
      setToast({ message: approvalError.message, bad: true });
      return;
    }
    updateCardsState((current) =>
      current.map((item) =>
        item.id === data.id ? hydrateCardFromBlocks(data) : item,
      ),
    );
    setToast({ message: t("Kart onaylandı ve yayınlandı.") });
  }

  async function moderateCard(card, status) {
    if (!supabase || !(profile?.role === "admin" || profile?.is_super_user))
      return;
    const reason =
      status === "rejected"
        ? window.prompt(t("Kart için ret gerekçesi girin:"))
        : null;
    if (status === "rejected" && reason === null) return;
    const { data, error: moderationError } = await supabase
      .from("nfc_cards")
      .update({
        status,
        rejection_reason: status === "rejected" ? reason.trim() || null : null,
      })
      .eq("id", card.id)
      .select()
      .single();
    if (moderationError) {
      setToast({ message: moderationError.message, bad: true });
      return;
    }
    updateCardsState((current) =>
      current.map((item) =>
        item.id === data.id ? hydrateCardFromBlocks(data) : item,
      ),
    );
    setToast({
      message: t(
        status === "rejected"
          ? "Kart reddedildi."
          : status === "suspended"
            ? "Kart askıya alındı."
            : status === "deleted"
              ? "Kart arşivlendi."
              : "Kart yeniden etkinleştirildi.",
      ),
    });
  }

  async function updateReportStatus(report, status) {
    const { error: updateError } = await supabase
      .from("abuse_reports")
      .update({ status })
      .eq("id", report.id);
    if (updateError) {
      setToast({
        message: t("Bildirim durumu güncellenemedi: {error}", {
          error: updateError.message,
        }),
        bad: true,
      });
      return;
    }
    setAbuseReports((current) =>
      current.map((item) =>
        item.id === report.id ? { ...item, status } : item,
      ),
    );
  }

  async function exportData() {
    const { data: profileData, error: profileError } =
      await supabase.auth.getUser();
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
    const [exportCards, feedbackResult, nfcTags, consents] = await Promise.all([
      fetchAllRows("nfc_cards", "*"),
      supabase.rpc("get_card_feedback"),
      fetchAllRows("nfc_tags", "*"),
      fetchAllRows("consent_records", "*"),
    ]);
    if (feedbackResult.error) throw feedbackResult.error;
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
      feedback: feedbackResult.data || [],
      consent_records: consents,
    };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bilgi-veri-disa-aktarim-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setToast({ message: t("Verileriniz JSON olarak indirildi.") });
  }

  async function deleteAccount() {
    const accepted = window.confirm(
      t(
        "Hesabınız, kartlarınız, etiketleriniz ve geri bildirimleriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?",
      ),
    );
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
      setToast({
        message:
          deleteError.message || t("Hesap silinemedi. Lütfen tekrar deneyin."),
        bad: true,
      });
    }
  }

  function goTo(nextSection) {
    setSection(nextSection);
    setMobileOpen(false);
    setError("");
  }

  if (devEditorPreviewRoute)
    return (
      <CardModal
        card={
          normalizedPath === "/__dev/card-create"
            ? null
            : hydrateCardFromBlocks(demoCard)
        }
        isAdmin={false}
        canSkipScan={false}
        accessToken=""
        user={{ id: "local-editor-preview", email: "preview@example.test" }}
        clients={[]}
        onClose={() => setAppPath("/c/demo", true)}
        onSaved={() => {}}
      />
    );
  if (legalRouteTarget) return <LegalRouteRedirect target={legalRouteTarget} />;
  if (normalizedPath === "/")
    return (
      <>
        <PublicLanding onReport={openReport} />
        {reportContext && (
          <AbuseReportModal
            context={reportContext}
            onClose={() => setReportContext(null)}
          />
        )}
      </>
    );
  if (cardKey)
    return (
      <>
        <PublicCard token={cardKey} onReport={openReport} />
        {reportContext && (
          <AbuseReportModal
            context={reportContext}
            onClose={() => setReportContext(null)}
          />
        )}
      </>
    );
  if (!authRoute)
    return (
      <>
        <PublicNotFound onReport={openReport} />
        {reportContext && (
          <AbuseReportModal
            context={reportContext}
            onClose={() => setReportContext(null)}
          />
        )}
      </>
    );
  if (!authReady)
    return (
      <div className="app-loading">
        <LoaderCircle className="spin" />
      </div>
    );
  if (!session)
    return (
      <>
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          onReport={openReport}
          initialNotice={authNotice}
        />
        {reportContext && (
          <AbuseReportModal
            context={reportContext}
            onClose={() => setReportContext(null)}
          />
        )}
      </>
    );
  if (isGoogleAuthSession(session) && googleConsentStatus !== "done") {
    if (
      googleConsentStatus === "checking" ||
      googleConsentStatus === "saving"
    ) {
      return (
        <div className="app-loading">
          <LoaderCircle className="spin" />
        </div>
      );
    }
    return (
      <GoogleConsentModal
        status={googleConsentStatus}
        error={googleConsentError}
        onRetry={() => setGoogleConsentStatus("checking")}
        onConfirm={acceptGoogleConsent}
      />
    );
  }

  const user = session.user;
  const isAdmin =
    profile?.role === "admin" ||
    profile?.role === "reseller" ||
    profile?.is_super_user === true;
  const pendingReports = abuseReports.filter(
    (report) => report.status === "pending",
  ).length;
  const visibleCards = cards.filter(
    (card) =>
      !isAdmin ||
      cardScope === "all" ||
      (cardScope === "managed"
        ? card.managed_by_admin
        : card.user_id === user.id && !card.managed_by_admin),
  );
  const filteredCards = visibleCards.filter((card) =>
    `${card.title} ${t("Dijital kart")}`
      .toLocaleLowerCase(language)
      .includes(query.toLocaleLowerCase(language)),
  );
  const heading = {
    overview: [t("Genel Bakış"), t("Dijital varlıklarınızın bugünkü özeti.")],
    cards: [
      t("Kartlarım"),
      t("Dijital kartlarınızı ve NFC bağlantılarınızı yönetin."),
    ],
    feedback: [
      t("Geri bildirimler"),
      t("Kartlarınız üzerinden gelen müşteri yorumları."),
    ],
    settings: [
      t("Hesap ayarları"),
      t("Kişisel verilerinizi ve hesabınızı yönetin."),
    ],
    abuse: [
      t("Kötüye kullanım bildirimleri"),
      t(
        "Bildirilen bağlantıları inceleyin ve gerekirse kartları geçici olarak devre dışı bırakın.",
      ),
    ],
    users: [
      t("Kullanıcı yönetimi"),
      t("Platform kullanıcılarını ve erişim durumlarını yönetin."),
    ],
    audit: [
      t("Denetim günlüğü"),
      t("Yönetici ve moderasyon işlemlerinin son kayıtları."),
    ],
    allowlist: [
      t("Güvenli alan adları"),
      t("URL taramasında güvenilir kabul edilen alan adlarını yönetin."),
    ],
  }[section];

  return (
    <div className="dashboard-shell">
      <Sidebar
        section={section}
        onSection={goTo}
        onSignOut={signOut}
        user={{
          ...user,
          role: profile?.role,
          is_super_user: profile?.is_super_user,
        }}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        dark={dark}
        onToggleTheme={() => setDark(!dark)}
        isAdmin={isAdmin}
        canManageUsers={canManageUsers}
        pendingReports={pendingReports}
      />
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            aria-label={t("Menüyü aç")}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            <span>{t("Çalışma alanı")}</span>
            <span>/</span>
            <strong>{heading[0]}</strong>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <a href="mailto:destek@openstacktool.com" className="topbar-help">
              <CircleHelp size={17} /> {t("Yardım")}
            </a>
            <span className="topbar-divider" />
            <button
              className="notification-button icon-button"
              aria-label={t("Bildirimler")}
              onClick={() =>
                isAdmin
                  ? goTo("abuse")
                  : setToast({ message: t("Yeni bildiriminiz yok.") })
              }
            >
              <Bell size={18} />
              {isAdmin && pendingReports > 0 && <i />}
            </button>
            <span className="top-avatar">
              {(user.user_metadata?.full_name || user.email || "B")
                .slice(0, 1)
                .toLocaleUpperCase("tr")}
            </span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Intl.DateTimeFormat(
                  language === "tr" ? "tr-TR" : "en-US",
                  { weekday: "long", day: "numeric", month: "long" },
                ).format(new Date())}
              </p>
              <h1>{heading[0]}</h1>
              <p>{heading[1]}</p>
            </div>
            {section !== "settings" &&
              section !== "feedback" &&
              section !== "abuse" &&
              section !== "users" &&
              section !== "audit" &&
              section !== "allowlist" && (
                <div className="heading-actions">
                  {isAdmin && (
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setStartManagedCard(true);
                        setModalCard(null);
                      }}
                    >
                      <Plus size={17} /> {t("Müşteri için kart oluştur")}
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setStartManagedCard(false);
                      setModalCard(null);
                    }}
                  >
                    <Plus size={17} /> {t("Yeni kart oluştur")}
                  </button>
                </div>
              )}
          </div>
          {error && (
            <div className="inline-error dashboard-error" role="alert">
              {t(error)}
              <button onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="content-loading">
              <LoaderCircle className="spin" /> {t("Yükleniyor…")}
            </div>
          ) : (
            <>
              {section === "overview" && (
                <>
                  <section className="stats-grid" aria-label={t("Hesap özeti")}>
                    <article className="stat-card">
                      <div className="stat-top">
                        <span>{t("Toplam kart")}</span>
                        <span className="stat-icon stat-purple">
                          <Smartphone size={17} />
                        </span>
                      </div>
                      <strong>
                        {cards.length.toString().padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="stat-dot dot-purple" />{" "}
                        {t("Tüm dijital kartlarınız")}
                      </p>
                    </article>
                    <article className="stat-card">
                      <div className="stat-top">
                        <span>{t("Herkese açık")}</span>
                        <span className="stat-icon stat-green">
                          <Globe2 size={17} />
                        </span>
                      </div>
                      <strong>
                        {cards
                          .filter((card) => card.access_mode === "public")
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="stat-dot dot-green" />{" "}
                        {t("Herkese açık kartlar")}
                      </p>
                    </article>
                    <article className="stat-card">
                      <div className="stat-top">
                        <span>{t("Gizli bağlantı")}</span>
                        <span className="stat-icon stat-orange">
                          <ShieldCheck size={17} />
                        </span>
                      </div>
                      <strong>
                        {cards
                          .filter((card) => card.access_mode === "private")
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="stat-dot dot-orange" />{" "}
                        {t("Özel bağlantılı kartlar")}
                      </p>
                    </article>
                    <article className="stat-card">
                      <div className="stat-top">
                        <span>{t("Müşteri geri bildirimi")}</span>
                        <span className="stat-icon stat-green">
                          <FileText size={17} />
                        </span>
                      </div>
                      <strong>
                        {feedbackTotal.toString().padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="stat-dot dot-green" />{" "}
                        {t("Toplam alınan yanıt")}
                      </p>
                    </article>
                    {canManageUsers && (
                      <>
                        <article className="stat-card">
                          <div className="stat-top">
                            <span>{t("Kayıtlı kullanıcılar")}</span>
                            <span className="stat-icon stat-purple">
                              <Users size={17} />
                            </span>
                          </div>
                          <strong>
                            {adminUserCounts.total.toString().padStart(2, "0")}
                          </strong>
                          <p>
                            <span className="stat-dot dot-purple" />{" "}
                            {t("Etkin kullanıcılar")}: {adminUserCounts.active}
                          </p>
                        </article>
                        <article className="stat-card">
                          <div className="stat-top">
                            <span>{t("Etkin kartlar")}</span>
                            <span className="stat-icon stat-green">
                              <Smartphone size={17} />
                            </span>
                          </div>
                          <strong>
                            {cards
                              .filter(
                                (card) =>
                                  card.status === "active" && card.is_active,
                              )
                              .length.toString()
                              .padStart(2, "0")}
                          </strong>
                          <p>
                            <span className="stat-dot dot-green" />{" "}
                            {t("Platform genelinde")}
                          </p>
                        </article>
                        <article className="stat-card">
                          <div className="stat-top">
                            <span>{t("Sistem durumu")}</span>
                            <span
                              className={`stat-icon ${error ? "stat-orange" : "stat-green"}`}
                            >
                              <ShieldCheck size={17} />
                            </span>
                          </div>
                          <strong>
                            {t(
                              error
                                ? "İnceleme gerekiyor"
                                : loading
                                  ? "Kontrol ediliyor"
                                  : "Bağlı",
                            )}
                          </strong>
                          <p>
                            <span
                              className={`stat-dot ${error ? "dot-orange" : "dot-green"}`}
                            />{" "}
                            {t("Supabase veri erişimi")}
                          </p>
                        </article>
                      </>
                    )}
                  </section>
                  <section className="panel cards-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{t("Son kartlarınız")}</h2>
                        <p>
                          {t("Tüm dijital kartlarınızı tek yerden yönetin.")}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => goTo("cards")}
                      >
                        {t("Tümünü gör")} <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {cards.length ? (
                      cards.slice(0, 4).map((card) => (
                        <CardRow
                          key={card.id}
                          card={card}
                          onEdit={openCardEditor}
                          onDelete={setDeleteCardTarget}
                          onViewFeedback={(selectedCard) => {
                            setFeedbackCardId(selectedCard.id);
                            goTo("feedback");
                          }}
                          onNotify={(message, bad) =>
                            setToast({ message, bad })
                          }
                          isAdmin={isAdmin}
                          canApprove={
                            profile?.role === "admin" || profile?.is_super_user
                          }
                          onApprove={approveCard}
                          onModerate={moderateCard}
                          onToggleActive={toggleCardActive}
                        />
                      ))
                    ) : (
                      <EmptyCards
                        onCreate={() => {
                          setStartManagedCard(false);
                          setModalCard(null);
                        }}
                      />
                    )}
                  </section>
                  <section className="trust-banner">
                    <span className="trust-icon">
                      <ShieldCheck size={21} />
                    </span>
                    <div>
                      <strong>
                        {t("Paylaştığınız her bağlantı kontrol altında")}
                      </strong>
                      <p>
                        {t(
                          "Harici bağlantılar kartınıza eklenmeden önce güvenlik kontrolünden geçirilir.",
                        )}
                      </p>
                    </div>
                    <span className="trust-check">
                      <Check size={16} />
                    </span>
                  </section>
                </>
              )}
              {section === "cards" && (
                <section className="panel cards-panel">
                  <div className="panel-heading cards-toolbar">
                    <div>
                      <h2>
                        {t("Tüm kartlar")}{" "}
                        <span className="count-pill">
                          {visibleCards.length}
                        </span>
                      </h2>
                      <p>
                        {t(
                          "Bağlantılarınızı görüntüleyin, kopyalayın veya güncelleyin.",
                        )}
                      </p>
                    </div>
                    <div className="cards-toolbar-controls">
                      {isAdmin && (
                        <div
                          className="card-scope-filter"
                          role="group"
                          aria-label={t("Kart kapsamı")}
                        >
                          <button
                            className={cardScope === "all" ? "active" : ""}
                            onClick={() => setCardScope("all")}
                          >
                            {t("Tüm kartlar")}
                          </button>
                          <button
                            className={cardScope === "personal" ? "active" : ""}
                            onClick={() => setCardScope("personal")}
                          >
                            {t("Kişisel kartlar")}
                          </button>
                          <button
                            className={cardScope === "managed" ? "active" : ""}
                            onClick={() => setCardScope("managed")}
                          >
                            {t("Müşteri kartları")}
                          </button>
                        </div>
                      )}
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={t("Kartlarda ara...")}
                        />
                      </label>
                    </div>
                  </div>
                  {filteredCards.length ? (
                    filteredCards.map((card) => (
                      <CardRow
                        key={card.id}
                        card={card}
                        onEdit={openCardEditor}
                        onDelete={setDeleteCardTarget}
                        onViewFeedback={(selectedCard) => {
                          setFeedbackCardId(selectedCard.id);
                          goTo("feedback");
                        }}
                        onNotify={(message, bad) => setToast({ message, bad })}
                        isAdmin={isAdmin}
                        canApprove={
                          profile?.role === "admin" || profile?.is_super_user
                        }
                        onApprove={approveCard}
                        onModerate={moderateCard}
                        onToggleActive={toggleCardActive}
                      />
                    ))
                  ) : (
                    <EmptyCards
                      onCreate={() => {
                        setStartManagedCard(false);
                        setModalCard(null);
                      }}
                    />
                  )}
                </section>
              )}
              {section === "feedback" && (
                <section className="panel feedback-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {feedbackCardId
                          ? `${cards.find((card) => card.id === feedbackCardId)?.title || t("Kart")} ${t("Geri bildirimleri")}`
                          : t("Müşteri yanıtları")}
                      </h2>
                      <p>
                        {t(
                          "Google yorum kartlarınızdan gelen geri bildirimler.",
                        )}
                      </p>
                    </div>
                    <div className="feedback-heading-actions">
                      {feedbackCardId && (
                        <button
                          className="text-button"
                          onClick={() => setFeedbackCardId("")}
                        >
                          {t("Tüm kartlar")}
                        </button>
                      )}
                      <span className="count-pill">
                        {
                          (feedbackCardId
                            ? feedback.filter(
                                (item) => item.card_id === feedbackCardId,
                              )
                            : feedback
                          ).length
                        }{" "}
                        {t("yanıt")}
                      </span>
                    </div>
                  </div>
                  {(feedbackCardId
                    ? feedback.filter((item) => item.card_id === feedbackCardId)
                    : feedback
                  ).length ? (
                    <div className="feedback-list">
                      {(feedbackCardId
                        ? feedback.filter(
                            (item) => item.card_id === feedbackCardId,
                          )
                        : feedback
                      ).map((item) => {
                        const card = cards.find(
                          (entry) => entry.id === item.card_id,
                        );
                        return (
                          <article className="feedback-row" key={item.id}>
                            <div className="feedback-rating">
                              {item.rating ? (
                                `${item.rating} ★`
                              ) : (
                                <FileText size={17} />
                              )}
                            </div>
                            <div className="feedback-copy">
                              <div>
                                <strong>
                                  {card?.title || t("Silinmiş kart")}
                                </strong>
                                <time>
                                  {new Date(item.created_at).toLocaleDateString(
                                    language === "tr" ? "tr-TR" : "en-US",
                                  )}
                                </time>
                              </div>
                              {item.display_name && (
                                <small>
                                  {item.is_name_hidden
                                    ? t("Anonim kullanıcı")
                                    : item.display_name}
                                </small>
                              )}
                              <p>
                                {item.customer_message ||
                                  t("Yorum metni belirtilmedi.")}
                              </p>
                              {item.display_email && (
                                <small>{item.display_email}</small>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <FileText size={21} />
                      </div>
                      <h3>{t("Henüz geri bildirim yok")}</h3>
                      <p>
                        {t(
                          "Müşterileriniz kartlarınız üzerinden yanıt verdiğinde burada görebilirsiniz.",
                        )}
                      </p>
                    </div>
                  )}
                </section>
              )}
              {section === "abuse" && isAdmin && (
                <section className="panel abuse-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {t("Kötüye kullanım bildirimleri")}{" "}
                        <span className="count-pill">{pendingReports}</span>
                      </h2>
                      <p>
                        {t(
                          "Bildirilen bağlantıları inceleyin ve gerekirse kartları geçici olarak devre dışı bırakın.",
                        )}
                      </p>
                    </div>
                  </div>
                  {abuseReports.length ? (
                    <div className="abuse-report-list">
                      {abuseReports.map((report) => {
                        const linkedCard = cards.find(
                          (card) => card.id === report.card_id,
                        );
                        return (
                          <article className="abuse-report-row" key={report.id}>
                            <div className="abuse-report-heading">
                              <div>
                                <span
                                  className={`report-status status-${report.status}`}
                                >
                                  {t(
                                    report.status === "pending"
                                      ? "Bekliyor"
                                      : report.status === "investigating"
                                        ? "İnceleniyor"
                                        : report.status === "resolved"
                                          ? "Çözüldü"
                                          : "Reddedildi",
                                  )}
                                </span>
                                <strong>
                                  {t(
                                    report.reason_category === "phishing"
                                      ? "Kimlik avı"
                                      : report.reason_category === "malware"
                                        ? "Kötü amaçlı yazılım"
                                        : report.reason_category ===
                                            "defamation"
                                          ? "İftira / hakaret"
                                          : report.reason_category ===
                                              "copyright"
                                            ? "Telif hakkı ihlali"
                                            : "Diğer",
                                  )}
                                </strong>
                              </div>
                              <time>
                                {new Date(report.created_at).toLocaleString(
                                  language === "tr" ? "tr-TR" : "en-US",
                                )}
                              </time>
                            </div>
                            <p>{report.details}</p>
                            <dl>
                              <div>
                                <dt>{t("Bildirilen URL")}</dt>
                                <dd>
                                  <code>{report.reported_url}</code>
                                </dd>
                              </div>
                              <div>
                                <dt>{t("E-posta adresiniz")}</dt>
                                <dd>{report.reporter_email}</dd>
                              </div>
                            </dl>
                            <div className="abuse-report-actions">
                              {linkedCard && (
                                <button
                                  className="button button-secondary"
                                  onClick={() => toggleCardActive(linkedCard)}
                                >
                                  <ShieldCheck size={15} />{" "}
                                  {linkedCard.is_active
                                    ? t("Kartı dondur")
                                    : t("Kartı etkinleştir")}{" "}
                                  · {linkedCard.title}
                                </button>
                              )}
                              {report.status === "pending" && (
                                <button
                                  className="button button-secondary"
                                  onClick={() =>
                                    updateReportStatus(report, "investigating")
                                  }
                                >
                                  {t("İncelemeye al")}
                                </button>
                              )}
                              {report.status !== "resolved" &&
                                report.status !== "dismissed" && (
                                  <button
                                    className="button button-primary"
                                    onClick={() =>
                                      updateReportStatus(report, "resolved")
                                    }
                                  >
                                    {t("Çözüldü olarak işaretle")}
                                  </button>
                                )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <ShieldCheck size={21} />
                      </div>
                      <h3>{t("Henüz kötüye kullanım bildirimi yok.")}</h3>
                      <p>{t("Yeni bildirimler burada görüntülenecektir.")}</p>
                    </div>
                  )}
                </section>
              )}
              {section === "users" && canManageUsers && (
                <section className="panel admin-users-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t("Kullanıcı yönetimi")}</h2>
                      <p>{t("Hesap durumlarını güvenli şekilde yönetin.")}</p>
                    </div>
                    <button
                      className="button button-secondary"
                      disabled={adminUsersBusy}
                      onClick={() =>
                        loadAdminUsers().catch((usersError) =>
                          setToast({ message: usersError.message, bad: true }),
                        )
                      }
                    >
                      {adminUsersBusy ? t("Yükleniyor") : t("Yenile")}
                    </button>
                  </div>
                  <div className="admin-user-stats">
                    <article>
                      <span>{t("Kayıtlı kullanıcılar")}</span>
                      <strong>{adminUserCounts.total}</strong>
                    </article>
                    <article>
                      <span>{t("Etkin kullanıcılar")}</span>
                      <strong>{adminUserCounts.active}</strong>
                    </article>
                  </div>
                  {adminUsers.length ? (
                    <>
                      <div className="admin-user-table-wrap">
                        <table className="admin-user-table">
                          <thead>
                            <tr>
                              <th>{t("Kullanıcı")}</th>
                              <th>{t("Rol")}</th>
                              <th>{t("Kayıt tarihi")}</th>
                              <th>{t("Durum")}</th>
                              <th>{t("İşlemler")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminUsers.map((adminUser) => (
                              <tr key={adminUser.id}>
                                <td>
                                  <strong>
                                    {adminUser.full_name ||
                                      t("Ad belirtilmedi")}
                                  </strong>
                                  <small>
                                    {adminUser.email || adminUser.id}
                                  </small>
                                </td>
                                <td>
                                  {adminUser.is_super_user
                                    ? t("Süper yönetici")
                                    : t(
                                        adminUser.role === "admin"
                                          ? "Yönetici"
                                          : adminUser.role === "reseller"
                                            ? "Bayi"
                                            : "Kullanıcı",
                                      )}
                                </td>
                                <td>
                                  {new Date(
                                    adminUser.created_at,
                                  ).toLocaleDateString(
                                    language === "tr" ? "tr-TR" : "en-US",
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`status-badge ${adminUser.is_suspended ? "status-suspended" : "status-public"}`}
                                  >
                                    <i />
                                    {adminUser.is_suspended
                                      ? t("Askıya alındı")
                                      : t("Etkin")}
                                  </span>
                                </td>
                                <td>
                                  {adminUser.role !== "admin" &&
                                    !adminUser.is_super_user && (
                                      <button
                                        className={`button ${adminUser.is_suspended ? "button-secondary" : "button-danger"}`}
                                        disabled={adminUsersBusy}
                                        onClick={() =>
                                          setAdminUserSuspended(
                                            adminUser,
                                            !adminUser.is_suspended,
                                          )
                                        }
                                      >
                                        {t(
                                          adminUser.is_suspended
                                            ? "Kullanıcıyı etkinleştir"
                                            : "Kullanıcıyı askıya al",
                                        )}
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {adminUsersHasMore && (
                        <button
                          className="button button-secondary load-more-users"
                          disabled={adminUsersBusy}
                          onClick={() =>
                            loadAdminUsers(adminUsersPage + 1, true).catch(
                              (usersError) =>
                                setToast({
                                  message: usersError.message,
                                  bad: true,
                                }),
                            )
                          }
                        >
                          {t("Daha fazla yükle")}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Users size={21} />
                      </div>
                      <h3>
                        {t(
                          adminUsersBusy
                            ? "Kullanıcılar yükleniyor..."
                            : "Kullanıcı bulunamadı.",
                        )}
                      </h3>
                    </div>
                  )}
                </section>
              )}
              {section === "audit" && canManageUsers && (
                <section className="panel admin-users-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t("Denetim günlüğü")}</h2>
                      <p>
                        {t(
                          "Yönetici ve moderasyon işlemlerinin son kayıtları.",
                        )}
                      </p>
                    </div>
                  </div>
                  {auditEvents.length ? (
                    <div className="admin-user-table-wrap">
                      <table className="admin-user-table">
                        <thead>
                          <tr>
                            <th>{t("İşlem")}</th>
                            <th>{t("Hedef")}</th>
                            <th>{t("Değişen alanlar")}</th>
                            <th>{t("Tarih")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditEvents.map((event) => (
                            <tr key={event.id}>
                              <td>
                                <strong>{event.action}</strong>
                                <small>
                                  {event.actor_user_id || t("Sistem")}
                                </small>
                              </td>
                              <td>
                                {event.entity_type} · {event.entity_id}
                              </td>
                              <td>
                                {(event.changed_fields || []).join(", ")}
                                {event.old_status || event.new_status
                                  ? ` · ${event.old_status || "—"} → ${event.new_status || "—"}`
                                  : ""}
                              </td>
                              <td>
                                {new Date(event.created_at).toLocaleString(
                                  language === "tr" ? "tr-TR" : "en-US",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <FileText size={21} />
                      </div>
                      <h3>{t("Henüz denetim kaydı yok.")}</h3>
                    </div>
                  )}
                </section>
              )}
              {section === "allowlist" && canManageUsers && (
                <section className="panel admin-users-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t("Güvenli alan adları")}</h2>
                      <p>
                        {t(
                          "Eklemeden önce alan adının güvenilir olduğundan emin olun. Alan adı ve alt alan adları tarama atlaması alır.",
                        )}
                      </p>
                    </div>
                  </div>
                  <form
                    className="scan-allowlist-form"
                    onSubmit={saveScanDomain}
                  >
                    <label className="field">
                      <span>{t("Alan adı")}</span>
                      <input
                        value={scanDomainInput}
                        onChange={(event) =>
                          setScanDomainInput(event.target.value)
                        }
                        placeholder="example.com"
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="button button-primary"
                      disabled={scanDomainBusy || !scanDomainInput.trim()}
                    >
                      {t("Güvenli alan adı ekle")}
                    </button>
                  </form>
                  <p className="field-hint">
                    {t(
                      "Güvenilir alan adı eşleşmeleri tüm alt alan adlarını da kapsar. URL güvenlik servisleri yine diğer alan adlarını kontrol eder.",
                    )}
                  </p>
                  {scanDomains.length ? (
                    <div className="scan-allowlist-list">
                      {scanDomains.map((item) => (
                        <div key={item.domain}>
                          <code>{item.domain}</code>
                          <button
                            className="button button-danger"
                            disabled={scanDomainBusy}
                            onClick={() => removeScanDomain(item.domain)}
                          >
                            {t("Kaldır")}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <ShieldCheck size={21} />
                      </div>
                      <h3>{t("Ek özel güvenli alan adı yok.")}</h3>
                      <p>
                        {t(
                          "Yerleşik güvenli alan adları URL tarama hizmetinde tanımlıdır.",
                        )}
                      </p>
                    </div>
                  )}
                </section>
              )}
              {section === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel">
                    <div className="settings-title">
                      <span className="settings-icon">
                        <UserRound size={18} />
                      </span>
                      <div>
                        <h2>{t("Profil bilgileri")}</h2>
                        <p>{t("Hesabınızla ilişkili bilgiler.")}</p>
                      </div>
                    </div>
                    <div className="settings-detail">
                      <span>{t("Ad soyad")}</span>
                      <strong>
                        {user.user_metadata?.full_name || t("Belirtilmedi")}
                      </strong>
                    </div>
                    <div className="settings-detail">
                      <span>{t("E-posta")}</span>
                      <strong>{user.email || t("Belirtilmedi")}</strong>
                    </div>
                    <div className="settings-detail">
                      <span>{t("Telefon")}</span>
                      <strong>{user.phone || t("Belirtilmedi")}</strong>
                    </div>
                    <div className="settings-detail">
                      <span>{t("Rol")}</span>
                      <strong>
                        {profile?.is_super_user
                          ? t("Süper yönetici")
                          : profile?.role === "admin"
                            ? t("Yönetici")
                            : profile?.role === "reseller"
                              ? t("Bayi")
                              : t("Doğrulanmış kullanıcı")}
                      </strong>
                    </div>
                    <div className="settings-detail">
                      <span>{t("Hesap oluşturma")}</span>
                      <strong>
                        {new Date(user.created_at).toLocaleDateString(
                          language === "tr" ? "tr-TR" : "en-US",
                        )}
                      </strong>
                    </div>
                  </section>
                  <section className="panel settings-panel">
                    <div className="settings-title">
                      <span className="settings-icon">
                        <ArrowDownToLine size={18} />
                      </span>
                      <div>
                        <h2>{t("Verileriniz")}</h2>
                        <p>{t("KVKK ve GDPR kapsamındaki veri haklarınız.")}</p>
                      </div>
                    </div>
                    <p className="settings-description">
                      {t(
                        "Profilinizi, kartlarınızı ve geri bildirimlerinizi makine tarafından okunabilir JSON biçiminde indirin.",
                      )}
                    </p>
                    <button
                      className="button button-secondary"
                      onClick={() =>
                        exportData().catch((exportError) =>
                          setToast({ message: exportError.message, bad: true }),
                        )
                      }
                    >
                      <ArrowDownToLine size={16} /> {t("Verilerimi dışa aktar")}
                    </button>
                  </section>
                  <section className="panel settings-panel danger-panel">
                    <div className="settings-title">
                      <span className="settings-icon danger-settings-icon">
                        <Trash2 size={18} />
                      </span>
                      <div>
                        <h2>{t("Kullanıcı Hesabını Sil")}</h2>
                        <p>{t("Bu işlem kalıcıdır ve geri alınamaz.")}</p>
                      </div>
                    </div>
                    <p className="settings-description">
                      {t(
                        "Hesabınızı sildiğinizde profiliniz, dijital kartlarınız, NFC bağlantılarınız ve ilişkili geri bildirim kayıtlarınız da silinir.",
                      )}
                    </p>
                    <button
                      className="button button-danger"
                      onClick={deleteAccount}
                    >
                      <Trash2 size={15} /> {t("Kullanıcı Hesabını Sil")}
                    </button>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
        <Footer onReport={openReport} />
      </main>
      {modalCard !== undefined && (
        <CardModal
          card={modalCard}
          isAdmin={isAdmin}
          canSkipScan={
            profile?.role === "admin" || profile?.is_super_user === true
          }
          accessToken={session?.access_token}
          user={user}
          clients={clients}
          startManaged={startManagedCard}
          key={modalCard?.id || "quick-create"}
          onClose={closeCardEditor}
          onSaved={(saved) => {
            updateCardsState((items) =>
              modalCard
                ? items.map((item) =>
                    item.id === saved.id ? hydrateCardFromBlocks(saved) : item,
                  )
                : [hydrateCardFromBlocks(saved), ...items],
            );
            if (!modalCard) {
              const savedCard = hydrateCardFromBlocks(saved);
              setModalCard(savedCard);
              setStartManagedCard(false);
              setAppPath(`/dashboard/cards/${encodeURIComponent(saved.id)}/edit`, true);
            }
            setToast({
              message:
                saved.status === "pending_approval"
                  ? t("Kartınız onay için kuyruğa alındı.")
                  : t(
                      modalCard
                        ? "Kart bilgileriniz güncellendi."
                        : "Yeni kartınız oluşturuldu.",
                    ),
            });
          }}
        />
      )}
      {deleteCardTarget && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingCard)
              setDeleteCardTarget(null);
          }}
        >
          <section
            className="modal delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-card-title"
          >
            <div className="delete-modal-icon">
              <Trash2 size={20} />
            </div>
            <h2 id="delete-card-title">
              {t("Kart kalıcı olarak silinsin mi?")}
            </h2>
            <p>
              <strong>{deleteCardTarget.title}</strong>{" "}
              {t(
                "kartı, ilişkili geri bildirimler ve etiketlerle birlikte silinecek. Bu işlem geri alınamaz.",
              )}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={deletingCard}
                onClick={() => setDeleteCardTarget(null)}
              >
                {t("Vazgeç")}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={deletingCard}
                onClick={deleteCard}
              >
                {deletingCard ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Trash2 size={15} />
                )}{" "}
                {t("Kartı sil")}
              </button>
            </div>
          </section>
        </div>
      )}
      {onboardingOpen && (
        <OnboardingModal
          busy={onboardingBusy}
          error={onboardingError}
          onChoose={(accountType) => completeOnboarding(accountType)}
          onSkip={() => completeOnboarding(null)}
        />
      )}
      {reportContext && (
        <AbuseReportModal
          context={reportContext}
          onClose={() => setReportContext(null)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.bad ? "toast-bad" : ""}`} role="status">
          {toast.bad ? <X size={17} /> : <Check size={17} />}
          {t(toast.message)}
          <button
            onClick={() => setToast(null)}
            aria-label={t("Bildirimi kapat")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyCards({ onCreate }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Link2 size={21} />
      </div>
      <h3>{t("İlk kartınızı oluşturun")}</h3>
      <p>{t("İşletmenizin dijital profilini birkaç adımda hazırlayın.")}</p>
      <button className="button button-primary" onClick={onCreate}>
        <Plus size={16} /> {t("Kart oluştur")}
      </button>
    </div>
  );
}

export default App;
