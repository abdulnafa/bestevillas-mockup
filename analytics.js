(() => {
  const loader = document.currentScript;
  const measurementId = loader?.dataset.gaMeasurementId?.trim() || "";
  const isValidMeasurementId = /^G-[A-Z0-9]+$/i.test(measurementId);

  // Keep the preview free of analytics requests until the real GA4 ID is supplied.
  if (!isValidMeasurementId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const remoteScript = document.createElement("script");
  remoteScript.async = true;
  remoteScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(remoteScript);

  function track(name, parameters = {}) {
    window.gtag("event", name, parameters);
  }

  function currentVilla() {
    const queryVilla = new URLSearchParams(window.location.search).get("villa");
    if (queryVilla) return queryVilla;
    const prettyRoute = window.location.pathname.match(/\/villas\/([a-z0-9-]+)\.html$/i);
    return prettyRoute?.[1] || "unspecified";
  }

  window.bestEVillasAnalytics = Object.freeze({
    grantConsent() {
      window.gtag("consent", "update", { analytics_storage: "granted" });
    },
    denyConsent() {
      window.gtag("consent", "update", { analytics_storage: "denied" });
    },
    track,
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (/^https:\/\/(?:www\.)?direct-book\.com\//i.test(href)) {
      track("booking_partner_click", {
        link_url: href,
        villa: currentVilla(),
      });
    } else if (/^(?:mailto:|tel:)/i.test(href)) {
      track("contact_click", { contact_method: href.split(":", 1)[0].toLowerCase() });
    }
  });

  document.addEventListener("submit", (event) => {
    const action = event.target instanceof HTMLFormElement ? event.target.action : "";
    if (/^https:\/\/(?:www\.)?direct-book\.com\//i.test(action)) {
      track("booking_partner_submit", {
        villa: currentVilla(),
      });
    }
  });
})();
