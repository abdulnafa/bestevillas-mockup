import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4173";
const debugUrl = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223";
const sourceBaseUrl = process.env.SOURCE_BASE_URL || "";
const evidenceDir = resolve(process.env.TEST_EVIDENCE_DIR || "testing/evidence");
const results = [];

function record(name, passed, detail = "") {
  const result = { name, passed: Boolean(passed), detail: String(detail || "") };
  results.push(result);
}

function villaLayoutProbeExpression() {
  return `(async () => {
    const waitForFrames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const gallery = document.querySelector('.property-gallery');
    const mainFrame = document.querySelector('.gallery-main-frame');
    const thumbnailRail = document.querySelector('.gallery-thumbnail-rail');
    const summary = document.querySelector('.property-summary');
    const summaryGrid = document.querySelector('.property-summary-grid');
    const facts = document.querySelector('.property-facts');
    const booking = document.querySelector('.property-booking');
    const cta = document.querySelector('.property-booking .button');
    const mainImage = document.querySelector('#villa-main-image');
    const required = { gallery, mainFrame, thumbnailRail, summary, summaryGrid, facts, booking, cta, mainImage };
    const missing = Object.entries(required).filter(([, element]) => !element).map(([name]) => name);
    if (missing.length) return { missing, states: [], transitions: [] };

    await Promise.race([
      mainImage.complete && mainImage.naturalWidth ? Promise.resolve() : new Promise((done) => {
        mainImage.addEventListener('load', done, { once: true });
        mainImage.addEventListener('error', done, { once: true });
      }),
      new Promise((done) => setTimeout(done, 5000)),
    ]);
    cta.scrollIntoView({ block: 'center', behavior: 'instant' });
    await waitForFrames();
    await new Promise((done) => setTimeout(done, 700));

    const cleanRect = (element) => {
      const rect = element.getBoundingClientRect();
      return Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map((key) => [key, Number(rect[key].toFixed(2))]));
    };
    const contains = (outer, inner, tolerance = 1.5) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
    const overlapArea = (first, second) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    const hitIsCta = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === cta || cta.contains(hit)));
    };
    const snapshot = (label) => {
      const rects = {
        gallery: cleanRect(gallery),
        main: cleanRect(mainFrame),
        rail: cleanRect(thumbnailRail),
        summary: cleanRect(summary),
        grid: cleanRect(summaryGrid),
        facts: cleanRect(facts),
        booking: cleanRect(booking),
        cta: cleanRect(cta),
      };
      const lastGalleryBottom = Math.max(rects.main.bottom, rects.rail.bottom);
      const ctaPoints = [
        [rects.cta.left + rects.cta.width / 2, rects.cta.top + rects.cta.height / 2],
        [rects.cta.left + 4, rects.cta.top + rects.cta.height / 2],
        [rects.cta.right - 4, rects.cta.top + rects.cta.height / 2],
      ];
      return {
        label,
        rects,
        galleryChildrenContained: contains(rects.gallery, rects.main) && contains(rects.gallery, rects.rail),
        summaryGap: Number((rects.grid.top - lastGalleryBottom).toFixed(2)),
        gallerySeparatedFromSummary: lastGalleryBottom <= rects.summary.top + 1.5 && rects.grid.top - lastGalleryBottom >= 20,
        summaryChildrenContained: contains(rects.grid, rects.facts) && contains(rects.grid, rects.booking),
        factsBookingOverlapArea: Number(overlapArea(rects.facts, rects.booking).toFixed(2)),
        ctaContained: contains(rects.booking, rects.cta),
        ctaVisible: rects.cta.left >= -1 && rects.cta.right <= innerWidth + 1 && rects.cta.top >= -1 && rects.cta.bottom <= innerHeight + 1,
        ctaLabelUnclipped: cta.scrollWidth <= cta.clientWidth + 1 && cta.scrollHeight <= cta.clientHeight + 1,
        ctaHitTargets: ctaPoints.every(([x, y]) => hitIsCta(x, y)),
        viewport: { width: innerWidth, height: innerHeight },
      };
    };

    const states = [snapshot('initial')];
    const buttons = Array.from(document.querySelectorAll('[data-gallery-thumb]'));
    const order = [...buttons.slice(1), buttons[0]].filter(Boolean);
    const transitions = [];
    for (const button of order) {
      const expected = new URL(button.dataset.gallerySrc || button.querySelector('img')?.getAttribute('src') || '', location.href).href;
      const expectedAlt = button.dataset.galleryAlt || button.querySelector('img')?.alt || '';
      thumbnailRail.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      thumbnailRail.scrollTo({
        left: Math.max(0, Math.min(thumbnailRail.scrollWidth - thumbnailRail.clientWidth, button.offsetLeft - (thumbnailRail.clientWidth - button.offsetWidth) / 2)),
        top: Math.max(0, Math.min(thumbnailRail.scrollHeight - thumbnailRail.clientHeight, button.offsetTop - (thumbnailRail.clientHeight - button.offsetHeight) / 2)),
        behavior: 'instant',
      });
      await waitForFrames();
      const buttonRect = button.getBoundingClientRect();
      const railRect = thumbnailRail.getBoundingClientRect();
      const controlCenterX = buttonRect.left + buttonRect.width / 2;
      const controlCenterY = buttonRect.top + buttonRect.height / 2;
      const controlVisible = controlCenterX >= railRect.left - 1.5
        && controlCenterX <= railRect.right + 1.5
        && controlCenterY >= railRect.top - 1.5
        && controlCenterY <= railRect.bottom + 1.5
        && controlCenterX >= 0
        && controlCenterX <= innerWidth
        && controlCenterY >= 0
        && controlCenterY <= innerHeight;
      const controlHitTarget = document.elementFromPoint(controlCenterX, controlCenterY);
      const controlHit = Boolean(controlHitTarget && (controlHitTarget === button || button.contains(controlHitTarget)));
      button.click();
      const deadline = Date.now() + 5000;
      while ((mainImage.alt !== expectedAlt || !mainImage.complete || !mainImage.naturalWidth || button.hasAttribute('aria-busy') || button.getAttribute('aria-pressed') !== 'true') && Date.now() < deadline) {
        await new Promise((done) => setTimeout(done, 25));
      }
      cta.scrollIntoView({ block: 'center', behavior: 'instant' });
      await waitForFrames();
      const ready = mainImage.alt === expectedAlt && mainImage.complete && mainImage.naturalWidth > 0 && !button.hasAttribute('aria-busy') && button.getAttribute('aria-pressed') === 'true';
      transitions.push({ index: button.dataset.galleryIndex, ready, controlVisible, controlHit, expected, expectedAlt, actual: mainImage.src, actualAlt: mainImage.alt });
      states.push(snapshot('thumbnail-' + button.dataset.galleryIndex));
    }
    return { missing, states, transitions };
  })()`;
}

function villaLayoutHealthy(probe) {
  return probe.missing.length === 0
    && probe.states.length >= 4
    && probe.transitions.every((transition) => transition.ready && transition.controlVisible && transition.controlHit)
    && probe.states.every((state) => state.galleryChildrenContained
      && state.gallerySeparatedFromSummary
      && state.summaryChildrenContained
      && state.factsBookingOverlapArea <= 1
      && state.ctaContained
      && state.ctaVisible
      && state.ctaLabelUnclipped
      && state.ctaHitTargets);
}

function closingLayoutProbeExpression() {
  return `(async () => {
    const cta = document.querySelector('.cms-call-to-action');
    const copy = cta?.querySelector('.centered-copy');
    const heading = copy?.querySelector('h2');
    const button = copy?.querySelector('.button');
    const footer = document.querySelector('.site-footer');
    const footerHeadings = Array.from(footer?.querySelectorAll('.footer-column h2') || []);
    const contentSections = Array.from(document.querySelectorAll('main > .section:not(.cms-call-to-action)'));
    const split = contentSections[0]?.querySelector('.split');
    const media = split?.querySelector('.framed-media');
    const narrow = contentSections.find((section) => section.querySelector('.narrow-copy'))?.querySelector('.narrow-copy');
    if (!cta || !copy || !heading || !button || !footer || footerHeadings.length !== 3) return { missing: true };
    const rgb = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const opaque = (value) => !/rgba?\\([^)]*,\\s*0(?:\\.0+)?\\s*\\)$/i.test(value);
    const luminance = (value) => {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels.length === 3 ? channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 : NaN;
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const ctaStyle = getComputedStyle(cta);
    const copyStyle = getComputedStyle(copy);
    const headingStyle = getComputedStyle(heading);
    const footerStyle = getComputedStyle(footer);
    const ctaBox = cta.getBoundingClientRect();
    const copyBox = copy.getBoundingClientRect();
    const headingBox = heading.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    cta.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((done) => setTimeout(done, 650));
    return {
      missing: false,
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      ctaBackground: ctaStyle.backgroundColor,
      ctaBackgroundOpaque: opaque(ctaStyle.backgroundColor),
      ctaBackgroundLuminance: luminance(ctaStyle.backgroundColor),
      ctaHeight: ctaBox.height,
      ctaHeadingSize: parseFloat(headingStyle.fontSize),
      ctaHeadingContrast: contrast(headingStyle.color, ctaStyle.backgroundColor),
      ctaCopyCentered: copyStyle.textAlign === 'center' && Math.abs((copyBox.left + copyBox.right) / 2 - (ctaBox.left + ctaBox.right) / 2) <= 20,
      ctaContentContained: headingBox.left >= ctaBox.left - 1 && headingBox.right <= ctaBox.right + 1 && headingBox.top >= ctaBox.top - 1 && buttonBox.left >= ctaBox.left - 1 && buttonBox.right <= ctaBox.right + 1 && buttonBox.bottom <= ctaBox.bottom + 1 && button.scrollWidth <= button.clientWidth + 1,
      ctaButtonHref: button.href,
      ctaButtonLabel: button.textContent.trim(),
      ctaButtonTarget: button.target,
      ctaButtonRel: button.rel,
      footerBackground: footerStyle.backgroundColor,
      footerHeadingSizes: footerHeadings.map((node) => parseFloat(getComputedStyle(node).fontSize)),
      footerHeadingContrasts: footerHeadings.map((node) => contrast(getComputedStyle(node).color, footerStyle.backgroundColor)),
      footerHeadings: footerHeadings.map((node) => node.textContent.trim()),
      contentSectionCount: contentSections.length,
      contentSectionPadding: contentSections.map((section) => parseFloat(getComputedStyle(section).paddingTop)),
      splitColumns: split ? getComputedStyle(split).gridTemplateColumns.split(' ').length : 0,
      mediaRatio: media ? media.getBoundingClientRect().width / media.getBoundingClientRect().height : 0,
      mediaObjectFit: media ? getComputedStyle(media.querySelector('img')).objectFit : '',
      narrowWidth: narrow?.getBoundingClientRect().width || 0
    };
  })()`;
}

function recordClosingVisual(probe, label, mobile = false, { cmsSections = true, bookingHref = "" } = {}) {
  const details = JSON.stringify(probe);
  record(`${label} closing CTA style and alignment`, !probe.missing && probe.ctaBackgroundOpaque && probe.ctaBackgroundLuminance < 0.2 && probe.ctaHeadingContrast >= 4.5 && probe.ctaCopyCentered && probe.ctaContentContained && probe.ctaHeight >= 180 && probe.ctaHeight <= (mobile ? 540 : 550) && probe.ctaHeadingSize >= 28 && probe.ctaHeadingSize <= (mobile ? 56 : 76) && !probe.overflow, details);
  record(`${label} footer heading size and contrast`, !probe.missing && probe.footerHeadings.join('|') === 'Explore|About|Stay in touch' && probe.footerHeadingSizes.every((size) => size >= 11 && size <= 24) && probe.footerHeadingContrasts.every((contrast) => contrast >= 4.5), details);
  if (cmsSections) record(`${label} CMS section spacing and media bounds`, !probe.missing && probe.contentSectionCount >= 2 && probe.contentSectionPadding.every((padding) => padding >= (mobile ? 48 : 60)) && probe.splitColumns === (mobile ? 1 : 2) && Math.abs(probe.mediaRatio - 4 / 3) < 0.05 && probe.mediaObjectFit === 'cover' && probe.narrowWidth > 0 && probe.narrowWidth <= 900 && !probe.overflow, details);
  if (bookingHref) record(`${label} external booking hand-off`, !probe.missing && probe.ctaButtonHref === bookingHref && probe.ctaButtonLabel === "Check availability" && probe.ctaButtonTarget === "_blank" && probe.ctaButtonRel.split(/\s+/).includes("noopener"), details);
}

async function openPage(url, navigationBaseUrl = baseUrl) {
  const response = await fetch(`${debugUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create Chrome tab: HTTP ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    const timeout = setTimeout(() => rejectOpen(new Error("Chrome WebSocket timed out")), 10000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolveOpen();
    });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = new Map();
  const messages = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) promise.reject(new Error(message.error.message));
      else promise.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") messages.push({ level: "error", text: message.params.exceptionDetails.text });
    if (message.method === "Log.entryAdded") messages.push({ level: message.params.entry.level, text: message.params.entry.text, url: message.params.entry.url || "" });
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      messages.push({ level: message.params.type, text: message.params.args.map((argument) => argument.value || argument.description || "").join(" ") });
    }
    const listeners = events.get(message.method) || [];
    listeners.forEach((listener) => listener(message.params));
    events.delete(message.method);
  });

  function send(method, params = {}) {
    id += 1;
    return new Promise((resolveCommand, rejectCommand) => {
      pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitFor(method, timeoutMs = 15000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listeners = events.get(method) || [];
      listeners.push((params) => {
        clearTimeout(timeout);
        resolveEvent(params);
      });
      events.set(method, listeners);
    });
  }

  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
    return response.result.value;
  }

  async function navigate(path) {
    const loaded = waitFor("Page.loadEventFired");
    await send("Page.navigate", { url: `${navigationBaseUrl}/${path.replace(/^\/+/, "")}` });
    await loaded;
    await evaluate(`(async () => {
      await Promise.race([
        Promise.all([document.fonts?.ready || Promise.resolve(), ...Array.from(document.images).filter((image) => image.loading !== 'lazy').map((image) => image.complete ? Promise.resolve() : new Promise((done) => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); }))]),
        new Promise((done) => setTimeout(done, 5000))
      ]);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return true;
    })()`);
  }

  async function viewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile });
  }

  async function screenshot(filename) {
    const captured = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(resolve(evidenceDir, filename), Buffer.from(captured.data, "base64"));
  }

  async function close() {
    socket.close();
    await fetch(`${debugUrl}/json/close/${target.id}`);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  return { close, evaluate, messages, navigate, screenshot, viewport };
}

await mkdir(evidenceDir, { recursive: true });

const routes = [
  "index.html",
  "villas.html",
  "villa.html",
  "locations.html",
  "about.html",
  "reviews.html",
  "guide.html",
  "faq.html",
  "policies.html",
  "contact.html",
  "villas/prospect-three.html",
  "villas/prospect-two.html",
  "villas/providence.html",
  "villas/st-silas.html",
];
for (const route of routes) {
  const response = await fetch(`${baseUrl}/${route}`);
  record(`HTTP ${route}`, response.status === 200, `status ${response.status}`);
}

const page = await openPage(`${baseUrl}/index.html`);
try {
  await page.viewport(1440, 1000);
  await page.navigate("index.html");
  const home = await page.evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.textContent.trim(),
    cmsSource: document.querySelector('main')?.dataset.cmsSource,
    villaCards: document.querySelectorAll('[data-villa]').length,
    slides: document.querySelectorAll('.hero-slide').length,
    activeSlides: document.querySelectorAll('.hero-slide.active').length,
    deferredSlides: Array.from(document.querySelectorAll('.hero-slide:not(.active) img')).filter((image) => image.dataset.responsiveSrc && (image.currentSrc || image.src).includes('-480.jpg')).length,
    missingImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
    overflow: document.documentElement.scrollWidth > innerWidth,
    analyticsRequests: performance.getEntriesByType('resource').filter((entry) => /googletagmanager|google-analytics/i.test(entry.name)).map((entry) => entry.name),
  })`);
  record("Generated homepage renders CMS content", home.title.includes("Best E Villas") && home.heading === "Beautiful Barbados villas." && home.cmsSource === "pages/home.md" && home.villaCards === 4, JSON.stringify(home));
  record("Generated homepage media and layout", home.slides >= 3 && home.activeSlides === 1 && home.deferredSlides === home.slides - 1 && home.missingImages.length === 0 && !home.overflow, JSON.stringify(home));
  record("Analytics remains inactive without ID", home.analyticsRequests.length === 0, JSON.stringify(home.analyticsRequests));
  const desktopClosing = await page.evaluate(closingLayoutProbeExpression());
  recordClosingVisual(desktopClosing, "Generated desktop");
  await page.screenshot("cms-home-closing-desktop.png");
  await page.evaluate(`document.querySelector('.site-footer')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await page.screenshot("cms-home-footer-desktop.png");
  await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  const carousel = await page.evaluate(`(async () => { document.querySelector('.carousel-next')?.click(); const deadline = Date.now() + 8000; let activeSlide = document.querySelector('.hero-slide.active'); let activeImage = activeSlide?.querySelector('img'); while ((activeSlide?.dataset.slide !== '1' || !activeImage?.complete || !activeImage?.naturalWidth || activeImage?.dataset.upgradePending === 'true' || (activeImage?.currentSrc || activeImage?.src || '').includes('-480.jpg')) && Date.now() < deadline) { await new Promise((done) => setTimeout(done, 25)); activeSlide = document.querySelector('.hero-slide.active'); activeImage = activeSlide?.querySelector('img'); } return { active: activeSlide?.dataset.slide, count: document.querySelector('.carousel-count strong')?.textContent, imageReady: Boolean(activeImage?.complete && activeImage?.naturalWidth), upgradePending: activeImage?.dataset.upgradePending === 'true', imageSource: activeImage?.currentSrc || activeImage?.src }; })()`);
  record("Generated carousel works without a blank slide", carousel.active === "1" && carousel.count === "02" && carousel.imageReady && !carousel.upgradePending && !carousel.imageSource.includes("-480.jpg"), JSON.stringify(carousel));
  await page.screenshot("cms-home-desktop.png");

  await page.navigate("villas.html");
  const listing = await page.evaluate(`({
    cards: document.querySelectorAll('[data-villa-card]').length,
    count: document.querySelector('#villa-result-count')?.textContent,
    bookingLinks: document.querySelectorAll('a[href^="https://direct-book.com/"]').length,
    prettyLinks: Array.from(document.querySelectorAll('[data-villa-card] h3 a')).map((link) => link.pathname),
    missingImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length,
  })`);
  record("CMS villa listing renders four records", listing.cards === 4 && listing.count === "4 villas" && listing.bookingLinks === 4 && listing.prettyLinks.every((path) => /\/villas\/[a-z0-9-]+\.html$/.test(path)) && listing.missingImages === 0, JSON.stringify(listing));
  const filtered = await page.evaluate(`(() => { const form = document.querySelector('#villa-filter-form'); form.querySelector('[name="location"]').value = 'south'; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return { visible: Array.from(document.querySelectorAll('[data-villa-card]')).filter((card) => !card.hidden).length, count: document.querySelector('#villa-result-count')?.textContent }; })()`);
  record("CMS villa filter works", filtered.visible === 1 && filtered.count === "1 villa", JSON.stringify(filtered));
  const listingClosing = await page.evaluate(closingLayoutProbeExpression());
  recordClosingVisual(listingClosing, "Villas desktop");
  await page.screenshot("cms-villas-closing-desktop.png");
  await page.evaluate(`document.querySelector('.site-footer')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await page.screenshot("cms-villas-footer-desktop.png");

  const villas = [
    ["prospect-three", "Prospect", "https://direct-book.com/properties/bestevillasprospctdirect"],
    ["prospect-two", "Prospect", "https://direct-book.com/properties/bestevillasprospctdirect"],
    ["providence", "Providence Terrace", "https://direct-book.com/properties/bestevillaprovidencedirect"],
    ["st-silas", "St. Silas", "https://direct-book.com/properties/bestevillasstsilasstjames"],
  ];
  for (const [slug, heading, booking] of villas) {
    await page.navigate(`villas/${slug}.html`);
    const detail = await page.evaluate(`(() => {
      const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => JSON.parse(node.textContent));
      const galleryImage = document.querySelector('#villa-main-image');
      return {
        title: document.title,
        heading: document.querySelector('h1')?.textContent.trim(),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        booking: document.querySelector('.property-booking a[href^="https://direct-book.com/"]')?.href,
        schema: JSON.stringify(schemas),
        galleryReady: Boolean(galleryImage?.complete && galleryImage?.naturalWidth),
        galleryCount: document.querySelectorAll('[data-gallery-thumb]').length,
        missingImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    const expectedGalleryCount = 8;
    record(`Pretty villa route ${slug}`, detail.heading.includes(heading) && detail.title.includes("Best E Villas") && detail.canonical === `https://bestevillas.com/villas/${slug}.html` && detail.booking === booking && detail.schema.includes("VacationRental") && detail.galleryReady && detail.galleryCount === expectedGalleryCount && detail.missingImages === 0 && !detail.overflow, JSON.stringify(detail));
    const layout = await page.evaluate(villaLayoutProbeExpression());
    record(`Villa gallery and availability layout ${slug} at 1440px`, villaLayoutHealthy(layout), JSON.stringify(layout));
    const villaClosing = await page.evaluate(closingLayoutProbeExpression());
    recordClosingVisual(villaClosing, `Villa ${slug} desktop`, false, { cmsSections: false, bookingHref: booking });
    if (slug === "st-silas") await page.screenshot("cms-villa-st-silas-closing-desktop.png");
    if (slug.startsWith("prospect-")) {
      const delivery = await page.evaluate(`(() => { const resources = performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'img' && entry.name.includes('/assets/images/properties/${slug}/')); return { count: resources.length, encodedBytes: resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0), originals: resources.map((entry) => entry.name).filter((name) => { const clean = name.split('?')[0].toLowerCase(); return !clean.endsWith('-480.jpg') && !clean.endsWith('-960.jpg'); }), resources: resources.map((entry) => ({ name: entry.name, encodedBodySize: entry.encodedBodySize || 0 })) }; })()`);
      record(`Prospect responsive gallery delivery ${slug}`, delivery.count >= 8 && delivery.originals.length === 0 && delivery.encodedBytes <= 1500000, JSON.stringify(delivery));
      await page.evaluate(`(async () => { const gallery = document.querySelector('.property-gallery-section'); if (gallery) window.scrollTo({ top: gallery.offsetTop - 96, behavior: 'instant' }); await new Promise((done) => setTimeout(done, 250)); return scrollY; })()`);
      await page.screenshot(`cms-villa-${slug}-gallery-desktop.png`);
    }
  }

  const prospectViewports = [
    [1920, 1080],
    [1536, 864],
    [1366, 768],
    [1181, 900],
    [1180, 900],
    [981, 900],
    [980, 900],
    [741, 900],
    [740, 900],
    [390, 844],
  ];
  for (const [width, height] of prospectViewports) {
    await page.viewport(width, height, width <= 740);
    await page.navigate(`villas/prospect-three.html?layout=${width}`);
    const layout = await page.evaluate(villaLayoutProbeExpression());
    record(`Prospect Three layout at ${width}x${height}`, villaLayoutHealthy(layout), JSON.stringify(layout));
    if (width === 1366 || width === 390) await page.screenshot(`cms-villa-prospect-three-availability-${width}.png`);
    if (width === 390) {
      await page.evaluate(`(async () => { const gallery = document.querySelector('.property-gallery-section'); if (gallery) window.scrollTo({ top: gallery.offsetTop - 84, behavior: 'instant' }); await new Promise((done) => setTimeout(done, 250)); return scrollY; })()`);
      await page.screenshot("cms-villa-prospect-three-gallery-mobile.png");
    }
  }

  await page.viewport(390, 844, true);
  await page.navigate("villas/prospect-two.html?gallery-mobile=1");
  const prospectTwoMobileLayout = await page.evaluate(villaLayoutProbeExpression());
  record("Prospect Two gallery layout at 390x844", villaLayoutHealthy(prospectTwoMobileLayout), JSON.stringify(prospectTwoMobileLayout));
  await page.evaluate(`(async () => { const gallery = document.querySelector('.property-gallery-section'); if (gallery) window.scrollTo({ top: gallery.offsetTop - 84, behavior: 'instant' }); await new Promise((done) => setTimeout(done, 250)); return scrollY; })()`);
  await page.screenshot("cms-villa-prospect-two-gallery-mobile.png");

  await page.viewport(1440, 1000);
  for (const [slug, heading] of villas) {
    await page.navigate(`villa.html?villa=${slug}`);
    const legacyRoute = await page.evaluate(`(async () => { const expectedPath = '/villas/${slug}.html'; const deadline = Date.now() + 4000; while (!location.pathname.endsWith(expectedPath) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50)); return { path: location.pathname, heading: document.querySelector('h1')?.textContent.trim(), cmsVilla: document.querySelector('main')?.dataset.cmsVillaPage, staleTemplate: Boolean(document.querySelector('[data-villa-template], #external-booking-form, .property-date-fields')) }; })()`);
    record(`Legacy villa query redirects to ${slug}`, legacyRoute.path.endsWith(`/villas/${slug}.html`) && legacyRoute.heading.includes(heading) && legacyRoute.cmsVilla === slug && !legacyRoute.staleTemplate, JSON.stringify(legacyRoute));
  }

  const fixedPages = ["locations.html", "about.html", "reviews.html", "guide.html", "faq.html", "policies.html", "contact.html"];
  for (const route of fixedPages) {
    await page.navigate(route);
    const state = await page.evaluate(`(() => { const nav = document.querySelector('.site-header > .mobile-nav'); const toggle = document.querySelector('.menu-toggle'); const header = document.querySelector('.header-inner'); const media = Array.from(document.querySelectorAll('.split-media')); return { heading: document.querySelector('h1')?.textContent.trim(), cmsBlock: Boolean(document.querySelector('[data-cms-source]')), brokenImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length, overflow: document.documentElement.scrollWidth > innerWidth, navDisplay: nav ? getComputedStyle(nav).display : null, navHidden: nav?.getAttribute('aria-hidden'), toggleDisplay: toggle ? getComputedStyle(toggle).display : null, headerLeft: header?.getBoundingClientRect().left, headerRight: header?.getBoundingClientRect().right, mediaRatios: media.map((item) => { const rect = item.getBoundingClientRect(); return rect.height ? rect.width / rect.height : 0; }), responsiveImages: Array.from(document.images).filter((image) => !image.classList.contains('brand-logo')).every((image) => image.hasAttribute('decoding') && image.hasAttribute('sizes') && (image.hasAttribute('srcset') || image.hasAttribute('data-responsive-srcset'))) }; })()`);
    record(`CMS fixed page ${route}`, Boolean(state.heading) && state.cmsBlock && state.brokenImages === 0 && !state.overflow && state.navDisplay === "none" && state.navHidden === "true" && state.toggleDisplay === "none" && state.headerLeft >= -1 && state.headerRight <= 1441 && state.mediaRatios.every((ratio) => Math.abs(ratio - 4 / 3) < 0.04) && state.responsiveImages, JSON.stringify(state));
    if (route === "locations.html") {
      await page.screenshot("cms-locations-desktop.png");
      await page.evaluate(`(async () => { const target = document.querySelectorAll('.split')[1]; if (target) window.scrollTo({ top: target.offsetTop - 120, behavior: 'instant' }); await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); return scrollY; })()`);
      await page.screenshot("cms-locations-sections-desktop.png");
    }
  }

  for (const width of [1080, 900, 861]) {
    await page.viewport(width, 900);
    await page.navigate("locations.html");
    const intermediate = await page.evaluate(`(() => { const nav = document.querySelector('.site-header > .mobile-nav'); const toggle = document.querySelector('.menu-toggle'); const header = document.querySelector('.header-inner'); return { navDisplay: getComputedStyle(nav).display, toggleDisplay: getComputedStyle(toggle).display, overflow: document.documentElement.scrollWidth > innerWidth, headerLeft: header.getBoundingClientRect().left, headerRight: header.getBoundingClientRect().right, viewport: innerWidth }; })()`);
    record(`Locations shell at ${width}px`, intermediate.navDisplay === "none" && intermediate.toggleDisplay === "none" && !intermediate.overflow && intermediate.headerLeft >= -1 && intermediate.headerRight <= intermediate.viewport + 1, JSON.stringify(intermediate));
  }

  await page.viewport(860, 900);
  await page.navigate("locations.html");
  const internalMobileMenu = await page.evaluate(`(() => { const toggle = document.querySelector('.menu-toggle'); const nav = document.querySelector('.site-header > .mobile-nav'); const before = getComputedStyle(nav).display; toggle.click(); const open = getComputedStyle(nav).display; const expanded = toggle.getAttribute('aria-expanded'); toggle.click(); return { before, open, after: getComputedStyle(nav).display, expanded, closedExpanded: toggle.getAttribute('aria-expanded'), overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  record("Internal-page mobile menu opens and closes", internalMobileMenu.before === "none" && internalMobileMenu.open !== "none" && internalMobileMenu.after === "none" && internalMobileMenu.expanded === "true" && internalMobileMenu.closedExpanded === "false" && !internalMobileMenu.overflow, JSON.stringify(internalMobileMenu));

  await page.viewport(390, 844, true);
  await page.navigate("index.html?mobile=1");
  const mobile = await page.evaluate(`(() => { const toggle = document.querySelector('.menu-toggle'); const ctaBottom = document.querySelector('.booking-bar .search-button')?.getBoundingClientRect().bottom; toggle?.click(); return { expanded: toggle?.getAttribute('aria-expanded'), navDisplay: getComputedStyle(document.querySelector('.mobile-nav')).display, overflow: document.documentElement.scrollWidth > innerWidth, headingHeight: document.querySelector('h1')?.getBoundingClientRect().height, ctaBottom, viewportHeight: innerHeight }; })()`);
  record("Generated mobile navigation and layout", mobile.expanded === "true" && mobile.navDisplay !== "none" && !mobile.overflow && mobile.headingHeight > 0 && mobile.ctaBottom <= mobile.viewportHeight, JSON.stringify(mobile));
  await page.screenshot("cms-home-mobile.png");
  await page.evaluate(`document.querySelector('.menu-toggle')?.click()`);
  const mobileClosing = await page.evaluate(closingLayoutProbeExpression());
  recordClosingVisual(mobileClosing, "Generated mobile", true);
  await page.screenshot("cms-home-closing-mobile.png");
  await page.evaluate(`document.querySelector('.site-footer')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await page.screenshot("cms-home-footer-mobile.png");

  await page.navigate("villas.html?mobile=1");
  const mobileListingClosing = await page.evaluate(closingLayoutProbeExpression());
  recordClosingVisual(mobileListingClosing, "Villas mobile", true);
  await page.screenshot("cms-villas-closing-mobile.png");
  await page.evaluate(`document.querySelector('.site-footer')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await page.screenshot("cms-villas-footer-mobile.png");

  await page.navigate("villas/st-silas.html");
  const villaMobile = await page.evaluate(`(() => { const toggle = document.querySelector('.menu-toggle'); toggle?.click(); return { expanded: toggle?.getAttribute('aria-expanded'), navDisplay: getComputedStyle(document.querySelector('.mobile-nav')).display, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  record("Generated villa mobile menu works", villaMobile.expanded === "true" && villaMobile.navDisplay !== "none" && !villaMobile.overflow, JSON.stringify(villaMobile));
  await page.evaluate(`document.querySelector('.menu-toggle')?.click()`);
  for (const [slug, , booking] of villas) {
    await page.navigate(`villas/${slug}.html?closing-mobile=1`);
    const villaClosing = await page.evaluate(closingLayoutProbeExpression());
    recordClosingVisual(villaClosing, `Villa ${slug} mobile`, true, { cmsSections: false, bookingHref: booking });
    if (slug === "st-silas") await page.screenshot("cms-villa-st-silas-closing-mobile.png");
  }

  const relevantMessages = page.messages.filter((message) => ["error", "warning"].includes(message.level) && !/favicon\.ico/i.test(`${message.text} ${message.url || ""}`));
  record("Generated-site browser console health", relevantMessages.length === 0, JSON.stringify(relevantMessages));
} finally {
  await page.close();
}

if (sourceBaseUrl) {
  const sourcePage = await openPage(`${sourceBaseUrl}/villa.html?villa=prospect-three`, sourceBaseUrl);
  try {
    const sourceViewports = [
      [1920, 1080],
      [1366, 768],
      [1181, 900],
      [1180, 900],
      [981, 900],
      [980, 900],
      [741, 900],
      [740, 900],
      [390, 844],
    ];
    for (const [width, height] of sourceViewports) {
      await sourcePage.viewport(width, height, width <= 740);
      await sourcePage.navigate(`villa.html?villa=prospect-three&source-layout=${width}`);
      const sourceIdentity = await sourcePage.evaluate(`({
        heading: document.querySelector('h1')?.textContent.trim(),
        legacyTemplate: document.querySelector('main')?.hasAttribute('data-villa-template'),
        generatedTemplate: document.querySelector('main')?.hasAttribute('data-cms-villa-page'),
      })`);
      const layout = await sourcePage.evaluate(villaLayoutProbeExpression());
      record(`Source villa fallback layout at ${width}x${height}`, sourceIdentity.heading?.includes("Prospect") && sourceIdentity.legacyTemplate && !sourceIdentity.generatedTemplate && villaLayoutHealthy(layout), JSON.stringify({ sourceIdentity, layout }));
      if (width === 1366) await sourcePage.screenshot("source-villa-prospect-three-availability-1366.png");
    }
    const sourceMessages = sourcePage.messages.filter((message) => ["error", "warning"].includes(message.level) && !/favicon\.ico/i.test(`${message.text} ${message.url || ""}`));
    record("Source villa fallback browser console health", sourceMessages.length === 0, JSON.stringify(sourceMessages));
  } finally {
    await sourcePage.close();
  }
}

const failed = results.filter((result) => !result.passed);
const report = { generatedAt: new Date().toISOString(), passed: results.length - failed.length, total: results.length, failed, results };
await writeFile(resolve(evidenceDir, "cms-browser-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
