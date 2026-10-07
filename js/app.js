const SUPABASE_URL = "https://lglocublmofeorophqbm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RXZ9AgOMTMzmUlVRC65x5Q_TGqF-1HC";

let activeCardData = null;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");
  const token = urlParams.get("token");
  let slug = urlParams.get("slug");

  if (!slug && !id) {
    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (
      lastSegment &&
      !lastSegment.includes(".html") &&
      lastSegment !== "informationpage"
    ) {
      slug = lastSegment;
    }
  }

  if (!id && !slug) {
    showGenericLanding();
    return;
  }

  try {
    const cardData = await fetchCardData(id, token, slug);
    if (!cardData) {
      showGenericLanding();
      return;
    }

    activeCardData = cardData;
    renderCardUI(cardData);
  } catch (err) {
    console.error("Kart bilgisi alınırken hata oluştu:", err);
    showError();
    return;
  }
}

async function fetchCardData(id, token, slug) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_nfc_card_data`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_id: id || null,
        p_token: token || null,
        p_slug: slug || null,
      }),
    },
  );

  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function renderCardUI(data) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("error-card").classList.add("hidden");
  document.getElementById("generic-landing").classList.add("hidden");
  document.getElementById("app-content").classList.remove("hidden");
  document.getElementById("card-title").innerText = data.title;

  if (data.access_mode === "public" && data.slug) {
    const badgeContainer = document.getElementById("badge-container");
    if (badgeContainer) {
      document.getElementById("badge-slug").innerText = "/" + data.slug;
      badgeContainer.classList.remove("hidden");
    }
  }

  if (data.type === "google_review") {
    setupGoogleReviewMode(data);
  } else if (data.type === "iban_card") {
    setupIbanCardMode(data);
  }
}

function showGenericLanding() {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("error-card").classList.add("hidden");
  document.getElementById("app-content").classList.add("hidden");
  document.getElementById("generic-landing").classList.remove("hidden");
}

function setupGoogleReviewMode(data) {
  const modeSection = document.getElementById("google-review-mode");
  modeSection.classList.remove("hidden");

  const stars = document.querySelectorAll(".star");
  const feedbackContainer = document.getElementById(
    "feedback-options-container",
  );
  const feedbackStatus = document.getElementById("feedback-contact-status");
  const feedbackOptions = buildFeedbackOptions(data);

  feedbackOptions.forEach((option) => {
    const link = document.getElementById(option.id);
    if (link) {
      link.href = option.href;
    }
  });

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      const rating = parseInt(star.getAttribute("data-value"));

      stars.forEach((s) => {
        if (parseInt(s.getAttribute("data-value")) <= rating) {
          s.classList.add("active");
        } else {
          s.classList.remove("active");
        }
      });

      if (rating <= 2) {
        showFeedbackOptions(
          feedbackOptions,
          feedbackContainer,
          feedbackStatus,
        );
      } else {
        feedbackContainer.classList.add("hidden");
        feedbackStatus.innerText = "";
        if (data.google_review_url) {
          setTimeout(() => {
            window.location.href = data.google_review_url;
          }, 350);
        } else {
          alert(
            "Google yorum bağlantısı işletme tarafından henüz tanımlanmamış.",
          );
        }
      }
    });
  });
}

function buildFeedbackOptions(data) {
  const options = [];

  const whatsappPhone = normalizePhone(data.contact_whatsapp);
  if (whatsappPhone) {
    const whatsappDigits = whatsappPhone.replace(/\D/g, "");
    options.push({
      id: "feedback-whatsapp",
      href: `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Merhaba, hizmetinizle ilgili geri bildirimde bulunmak istiyorum.")}`,
    });
  }

  const smsPhone = normalizePhone(data.contact_sms);
  if (smsPhone) {
    options.push({
      id: "feedback-sms",
      href: `sms:${smsPhone}`,
    });
  }

  if (data.contact_instagram) {
    let instaUrl = data.contact_instagram.trim();
    if (!instaUrl.startsWith("http://") && !instaUrl.startsWith("https://")) {
      instaUrl = "https://instagram.com/" + instaUrl.replace("@", "");
    }
    options.push({
      id: "feedback-instagram",
      href: instaUrl,
    });
  }

  const email =
    typeof data.contact_email === "string" ? data.contact_email.trim() : "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    options.push({
      id: "feedback-email",
      href: `mailto:${encodeURI(email)}?subject=${encodeURIComponent("Geri Bild