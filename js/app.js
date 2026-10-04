const SUPABASE_URL = "https://lglocublmofeorophqbm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RXZ9AgOMTMzmUlVRC65x5Q_TGqF-1HC";

let activeCardData = null;
let selectedStarRating = 0;

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
        if (lastSegment && !lastSegment.includes(".html") && lastSegment !== "informationpage") {
            slug = lastSegment;
        }
    }

    if (!id && !slug) {
        showError();
        return;
    }

    try {
        const cardData = await fetchCardData(id, token, slug);
        if (!cardData) {
            showError();
            return;
        }

        activeCardData = cardData;
        renderCardUI(cardData);
    } catch (err) {
        console.error("Kart bilgisi alınırken hata oluştu:", err);
        showError();
    }
}

async function fetchCardData(id, token, slug) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_nfc_card_data`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
            p_id: id || null,
            p_token: token || null,
            p_slug: slug || null
        })
    });

    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function renderCardUI(data) {
    document.getElementById("loading").classList.add("hidden");
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

function setupGoogleReviewMode(data) {
    const modeSection = document.getElementById("google-review-mode");
    modeSection.classList.remove("hidden");

    const stars = document.querySelectorAll(".star");
    const feedbackContainer = document.getElementById("feedback-form-container");

    stars.forEach(star => {
        star.addEventListener("click", () => {
            const rating = parseInt(star.getAttribute("data-value"));
            selectedStarRating = rating;

            stars.forEach(s => {
                if (parseInt(s.getAttribute("data-value")) <= rating) {
                    s.classList.add("active");
                } else {
                    s.classList.remove("active");
                }
            });

            if (rating <= 2) {
                feedbackContainer.classList.remove("hidden");
            } else {
                feedbackContainer.classList.add("hidden");
                if (data.google_review_url) {
                    setTimeout(() => {
                        window.location.href = data.google_review_url;
                    }, 350);
                } else {
                    alert("Google yorum bağlantısı işletme tarafından henüz tanımlanmamış.");
                }
            }
        });
    });

    document.getElementById("btn-submit-feedback").addEventListener("click", async () => {
        const message = document.getElementById("feedback-text").value.trim();
        const contact = document.getElementById("feedback-contact").value.trim();
        const statusEl = document.getElementById("feedback-status");

        if (!message) {
            statusEl.innerText = "Lütfen yaşadığınız sorunu kısaca belirtin.";
            statusEl.style.color = "#ef4444";
            return;
        }

        statusEl.innerText = "İletiliyor...";
        statusEl.style.color = "#9ca3af";

        const success = await sendFeedback(data.id, message, contact, selectedStarRating);
        if (success) {
            statusEl.innerText = "Bildiriminiz başarıyla iletildi. Teşekkür ederiz.";
            statusEl.style.color = "#10b981";
            document.getElementById("feedback-text").value = "";
            document.getElementById("feedback-contact").value = "";
            
            setTimeout(() => {
                feedbackContainer.classList.add("hidden");
            }, 3000);
        } else {
            statusEl.innerText = "Sistemsel bir hata oluştu, lütfen daha sonra tekrar deneyin.";
            statusEl.style.color = "#ef4444";
        }
    });
}

async function sendFeedback(cardId, message, contact, rating) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_card_feedback`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                p_card_id: cardId,
                p_message: message,
                p_contact: contact || null,
                p_rating: rating
            })
        });
        return response.ok;
    } catch {
        return false;
    }
}

// function setupIbanCardMode(data) {
//     const modeSection = document.getElementById("iban-card-mode");
//     modeSection.classList.remove("hidden");

//     if (data.iban) {
//         document.getElementById("iban-section").classList.remove("hidden");
//         document.getElementById("bank-name").innerText = data.bank_name || "Banka Hesabı";
//         document.getElementById("account-holder").innerText = data.title || "";
//         document.getElementById("iban-text").innerText = data.iban;

//         document.getElementById("btn-copy-iban").addEventListener("click", () => {
//             navigator.clipboard.writeText(data.iban);
//             const copyBtn = document.getElementById("btn-copy-iban");
//             copyBtn.innerText = "Kopyalandı";
//             setTimeout(() => { copyBtn.innerText = "Kopyala"; }, 2000);
//         });
//     }

//     if (data.instagram_url) {
//         const el = document.getElementById("link-instagram");
//         el.href = data.instagram_url;
//         const handle = data.instagram_url.split("/").filter(Boolean).pop();
//         if (handle) {
//             const handleEl = document.getElementById("instagram-handle");
//             if (handleEl) handleEl.innerText = "@" + handle;
//         }
//         el.classList.remove("hidden");
//     }

//     setupLink("link-email", data.email ? `mailto:${data.email}` : null, "E-posta Gönder");
//     setupLink("link-alt-1", data.alt_link_1, "Bağlantı 1");
//     setupLink("link-alt-2", data.alt_link_2, "Bağlantı 2");
//     setupLink("link-alt-3", data.alt_link_3, "Bağlantı 3");
// }
function setupIbanCardMode(data) {
    const modeSection = document.getElementById("iban-card-mode");
    modeSection.classList.remove("hidden");

    if (data.iban) {
        const ibanBox = document.getElementById("iban-box");

        if (ibanBox) {
            ibanBox.classList.remove("hidden");
        }

        document.getElementById("bank-name").innerText =
            data.bank_name || "Banka Hesabı";

        document.getElementById("iban-text").innerText =
            data.iban;

        document.getElementById("btn-copy-iban").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(data.iban);

                const copyBtn = document.getElementById("btn-copy-iban");
                copyBtn.innerText = "Kopyalandı";

                setTimeout(() => {
                    copyBtn.innerText = "Kopyala";
                }, 2000);

            } catch (err) {
                console.error("IBAN kopyalanamadı:", err);
            }
        });
    }

    if (data.instagram_url) {
        const el = document.getElementById("link-instagram");

        if (el) {
            let instagramUrl = data.instagram_url;

            // Kullanıcı sadece instagram.com yazdıysa otomatik düzelt
            if (!instagramUrl.startsWith("http://") &&
                !instagramUrl.startsWith("https://")) {
                instagramUrl = "https://" + instagramUrl;
            }

            el.href = instagramUrl;
            el.classList.remove("hidden");
        }
    }

    setupLink(
        "link-email",
        data.email ? `mailto:${data.email}` : null,
        "E-posta Gönder"
    );

    setupLink(
        "link-alt-1",
        data.alt_link_1,
        "Bağlantı 1"
    );

    setupLink(
        "link-alt-2",
        data.alt_link_2,
        "Bağlantı 2"
    );

    setupLink(
        "link-alt-3",
        data.alt_link_3,
        "Bağlantı 3"
    );
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
    document.getElementById("error-card").classList.remove("hidden");
}