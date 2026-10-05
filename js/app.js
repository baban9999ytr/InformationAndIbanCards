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
  /* Optional redirect for generic or unmatched sessions:
    window.location.replace("https://openstacktool.com");
    */
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
    link.href = option.href;
    link.classList.remove("hidden");
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
        showFeedbackOptions(feedbackOptions, feedbackContainer, feedbackStatus);
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
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const phone = normalizePhone(data.phone);
  const whatsappPhone =
    normalizePhone(data.whatsapp_number) || normalizePhone(data.phone);

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    options.push({
      id: "feedback-email",
      href: `mailto:${encodeURI(email)}?subject=${encodeURIComponent("Geri Bildirim")}`,
    });
  }

  if (whatsappPhone) {
    const whatsappDigits = whatsappPhone.replace(/\D/g, "");
    options.push({
      id: "feedback-whatsapp",
      href: `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Merhaba, hizmetinizle ilgili geri bildirimde bulunmak istiyorum.")}`,
    });
  }

  if (phone) {
    options.push({
      id: "feedback-sms",
      href: `sms:${phone}`,
    });
  }

  return options;
}

function normalizePhone(value) {
  if (typeof value !== "string") return null;

  const phone = value.trim().replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}

function showFeedbackOptions(options, container, status) {
  status.innerText = "";

  if (options.length === 1) {
    window.location.href = options[0].href;
    return;
  }

  container.classList.remove("hidden");

  if (options.length === 0) {
    status.innerText =
      "İşletme için kullanılabilir bir iletişim kanalı bulunmuyor.";
  }
}

function setupIbanCardMode(data) {
  const modeSection = document.getElementById("iban-card-mode");
  modeSection.classList.remove("hidden");

  const ibanBox = document.getElementById("iban-box");
  const accountHolder = data.account_holder || data.title;
  const receiverRow = document.getElementById("receiver-copy-row");

  if (data.iban || accountHolder) {
    ibanBox.classList.remove("hidden");
  }

  if (data.iban) {
    document.getElementById("bank-name").innerText =
      data.bank_name || "Banka Hesabı";

    document.getElementById("iban-text").innerText = data.iban;

    document
      .getElementById("btn-copy-iban")
      .addEventListener("click", (event) => {
        copyToClipboard(data.iban, event.currentTarget);
      });
  }

  if (accountHolder) {
    document.getElementById("account-holder").innerText = accountHolder;
    receiverRow.classList.remove("hidden");
    document
      .getElementById("btn-copy-receiver")
      .addEventListener("click", (event) => {
        copyToClipboard(accountHolder, event.currentTarget);
      });
  }

  if (data.instagram_url) {
    const el = document.getElementById("link-instagram");

    if (el) {
      let instagramUrl = data.instagram_url;

      if (
        !instagramUrl.startsWith("http://") &&
        !instagramUrl.startsWith("https://")
      ) {
        instagramUrl = "https://" + instagramUrl;
      }

      el.href = instagramUrl;
      el.classList.remove("hidden");
    }
  }

  setupLink("link-alt-1", data.alt_link_1, "Bağlantı 1");

  setupLink("link-alt-2", data.alt_link_2, "Bağlantı 2");

  setupLink("link-alt-3", data.alt_link_3, "Bağlantı 3");
}

function setupLink(elementId, url, defaultText) {
  if (url) {
    const el = document.getElementById(elementId);
    el.href = url;
    el.innerText = defaultText;
    el.classList.remove("hidden");
  }
}

function showError() {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("app-content").classList.add("hidden");
  document.getElementById("generic-landing").classList.add("hidden");
  document.getElementById("error-card").classList.remove("hidden");
}

async function copyToClipboard(value, button) {
  const defaultText = button.dataset.defaultText || button.innerText;
  button.dataset.defaultText = defaultText;

  try {
    await navigator.clipboard.writeText(value);
    button.innerText = "Kopyalandı";
  } catch (err) {
    console.error("Panoya kopyalanamadı:", err);
    button.innerText = "Kopyalanamadı";
  }

  window.setTimeout(() => {
    button.innerText = defaultText;
  }, 2000);
}
