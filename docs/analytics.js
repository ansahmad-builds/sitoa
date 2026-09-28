(() => {
  "use strict";
  const config = window.AR_ANALYTICS_CONFIG || {};
  const id = config.measurementId || "";
  const ready = /^G-[A-Z0-9]{4,}$/.test(id) && config.noticeApproved === true;
  const storageKey = "ar-analytics-consent-v1";
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  let choice = null;
  let loaded = false;
  let previousFocus = null;
  if (id) window["ga-disable-" + id] = true;

  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && stored.version === config.noticeVersion && stored.expires > Date.now() &&
        ["granted", "denied"].includes(stored.choice)) choice = stored.choice;
  } catch (_) { /* Unavailable storage defaults to no tracking. */ }
  if (privacySignal) choice = "denied";

  const markup = `
    <section class="analytics-banner" id="analytics-banner" aria-labelledby="analytics-banner-title" hidden>
      <div><h2 id="analytics-banner-title">Optional analytics</h2>
      <p>May we use Google Analytics to understand visits and improve these pages? It uses analytics cookies and sends usage data to Google. Nothing is loaded unless you agree. <a href="${config.privacyUrl}">Privacy &amp; cookies</a></p></div>
      <div class="consent-actions"><button type="button" data-choice="denied">Reject analytics</button><button type="button" data-choice="granted">Accept analytics</button></div>
    </section>
    <dialog class="analytics-dialog" id="analytics-dialog" aria-labelledby="analytics-dialog-title">
      <h2 id="analytics-dialog-title">Analytics preferences</h2>
      <p id="analytics-state"></p>
      <p>Optional Google Analytics is separate from the hosting needed to deliver these pages. Your choice is kept on this site for up to 180 days. Each subdomain has its own choice.</p>
      <p><a href="${config.privacyUrl}">Read privacy &amp; cookies information</a></p>
      <div class="consent-actions"><button type="button" data-choice="denied">Reject / withdraw</button><button type="button" data-choice="granted" id="analytics-allow">Accept analytics</button><button type="button" id="analytics-close">Close</button></div>
    </dialog>`;
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  document.body.append(holder);
  const banner = document.getElementById("analytics-banner");
  const dialog = document.getElementById("analytics-dialog");
  const allow = document.getElementById("analytics-allow");
  allow.hidden = !ready || privacySignal;

  function persist(value) {
    choice = value;
    try { localStorage.setItem(storageKey, JSON.stringify({ choice: value, version: config.noticeVersion, expires: Date.now() + lifetime })); } catch (_) {}
  }

  function clearCookies() {
    const names = document.cookie.split(";").map(item => item.trim().split("=")[0]).filter(name => /^_ga($|_)/.test(name) || /^_gid$|^_gat/.test(name));
    const parts = location.hostname.split(".");
    const domains = ["", location.hostname];
    for (let index = 1; index < parts.length - 1; index++) domains.push(parts.slice(index).join("."));
    for (const name of names) for (const domain of domains) {
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax" + (domain ? "; domain=" + domain : "") + (location.protocol === "https:" ? "; Secure" : "");
    }
  }

  function startAnalytics() {
    if (!ready || choice !== "granted" || privacySignal || loaded) return;
    loaded = true;
    window["ga-disable-" + id] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    let referrer = "";
    try { if (document.referrer) referrer = new URL(document.referrer).origin + "/"; } catch (_) {}
    const pageData = { page_title: document.title, page_location: location.origin + location.pathname, page_referrer: referrer };
    // Apply sanitized defaults to automatic events too, not only the manual page view.
    window.gtag("set", pageData);
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("set", "ads_data_redaction", true);
    window.gtag("set", "url_passthrough", false);
    window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("js", new Date());
    window.gtag("config", id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      ...pageData,
      cookie_domain: "none", // Host-only: the apex must not share identifiers with subdomains.
      cookie_expires: lifetime / 1000,
      cookie_update: false,
      cookie_flags: "SameSite=Lax" + (location.protocol === "https:" ? ";Secure" : "")
    });
    window.gtag("event", "page_view", pageData);
    const script = document.createElement("script");
    script.id = "ar-google-tag";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.append(script);
  }

  function closeDialog() { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); }
  function choose(value) {
    if (value === "granted" && (!ready || privacySignal)) return;
    persist(value);
    banner.hidden = true;
    if (dialog.open) closeDialog();
    if (value === "granted") startAnalytics();
    else {
      if (id) window["ga-disable-" + id] = true;
      clearCookies();
      if (loaded) {
        document.getElementById("ar-google-tag")?.remove();
        window.dataLayer = [];
        location.reload(); // Unload Google; the saved denial prevents any reload of its tag.
      }
    }
  }

  holder.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => choose(button.dataset.choice)));
  document.getElementById("analytics-close").addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", () => { if (previousFocus?.isConnected) previousFocus.focus(); });
  document.querySelectorAll("[data-analytics-settings]").forEach(button => button.addEventListener("click", () => {
    previousFocus = button;
    document.getElementById("analytics-state").textContent = !ready
      ? "Google Analytics is disabled on this website. No Analytics data is sent to Google."
      : privacySignal ? "Your browser’s privacy signal is respected. Analytics is off."
      : choice === "granted" ? "Analytics is currently allowed. You can withdraw consent below."
      : "Analytics is off. You can keep it off or choose to allow it.";
    dialog.showModal();
  }));
  window.addEventListener("storage", event => {
    if (event.key !== storageKey) return;
    let value = null;
    try {
      const stored = JSON.parse(event.newValue);
      if (stored && stored.version === config.noticeVersion && stored.expires > Date.now()) value = stored.choice;
    } catch (_) {}
    if (value !== "granted") {
      choice = "denied";
      if (id) window["ga-disable-" + id] = true;
      clearCookies();
      if (loaded) location.reload();
    }
  });
  if (!ready || choice !== "granted") clearCookies();
  if (ready && !choice && !privacySignal) banner.hidden = false;
  startAnalytics();
})();
