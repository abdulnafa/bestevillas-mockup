import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4173";
const debugUrl = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223";
const evidenceDir = resolve("testing", "evidence");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function createCdpPage(url) {
  const response = await fetch(`${debugUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create Chrome tab: HTTP ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    const timeout = setTimeout(() => rejectOpen(new Error("Chrome WebSocket connection timed out")), 10000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolveOpen();
    });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const eventListeners = new Map();
  const browserMessages = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(message.error.message));
      else resolveCommand(message.result);
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      browserMessages.push({ level: "error", text: message.params.exceptionDetails.text });
    }
    if (message.method === "Log.entryAdded") {
      browserMessages.push({
        level: message.params.entry.level,
        text: message.params.entry.text,
        url: message.params.entry.url || "",
      });
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const level = message.params.type;
      if (level === "error" || level === "warning") {
        browserMessages.push({
          level,
          text: message.params.args.map((arg) => arg.value || arg.description || "").join(" "),
        });
      }
    }

    const listeners = eventListeners.get(message.method) || [];
    listeners.forEach((listener) => listener(message.params));
    eventListeners.delete(message.method);
  });

  function send(method, params = {}) {
    commandId += 1;
    return new Promise((resolveCommand, rejectCommand) => {
      pending.set(commandId, { resolveCommand, rejectCommand });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  }

  function waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timeout);
        resolveEvent(params);
      };
      const listeners = eventListeners.get(method) || [];
      listeners.push(listener);
      eventListeners.set(method, listeners);
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result.value;
  }

  async function navigate(nextUrl) {
    const loaded = waitForEvent("Page.loadEventFired");
    await send("Page.navigate", { url: nextUrl });
    await loaded;
    await evaluate(`(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      Array.from(document.images).forEach((image) => image.loading = 'eager');
      const step = Math.max(window.innerHeight * 0.8, 500);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolveScroll) => setTimeout(resolveScroll, 50));
      }
      window.scrollTo(0, 0);
      await Promise.race([
        Promise.all([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          ...Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((resolveImage) => {
            image.addEventListener('load', resolveImage, { once: true });
            image.addEventListener('error', resolveImage, { once: true });
          }))
        ]),
        new Promise((resolveAssets) => setTimeout(resolveAssets, 4000))
      ]);
      window.scrollTo(0, 0);
      await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      window.scrollTo(0, 0);
      return true;
    })()`);
  }

  async function setViewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async function screenshot(filename) {
    const result = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(resolve(evidenceDir, filename), Buffer.from(result.data, "base64"));
  }

  async function close() {
    socket.close();
    await fetch(`${debugUrl}/json/close/${target.id}`);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  return { browserMessages, close, evaluate, navigate, screenshot, setViewport };
}

async function checkHttpRoutes(routes) {
  for (const route of routes) {
    const response = await fetch(`${baseUrl}/${route}`);
    record(`HTTP ${route || "index.html"}`, response.status === 200, `status ${response.status}`);
  }
}

await mkdir(evidenceDir, { recursive: true });

const routes = [
  "index.html",
  "villas.html",
  "villa.html?villa=providence",
  "locations.html",
  "about.html",
  "reviews.html",
  "guide.html",
  "faq.html",
  "policies.html",
  "contact.html",
];

await checkHttpRoutes(routes);
const page = await createCdpPage(`${baseUrl}/index.html`);

try {
  await page.setViewport(1440, 1000);
  await page.navigate(`${baseUrl}/index.html`);

  const home = await page.evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.textContent.trim(),
    activeSlides: document.querySelectorAll('.hero-slide.active').length,
    slideCount: document.querySelectorAll('.hero-slide').length,
    forbidden: document.querySelectorAll('.concept-ribbon, .header-phone, dialog, .favorite-button').length,
    missingImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length,
    missingImageSources: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  })`);
  record("Homepage identity", home.title.includes("Best E Villas") && home.heading === "Beautiful Barbados villas.", JSON.stringify(home));
  record("Homepage carousel rendered", home.slideCount === 3 && home.activeSlides === 1, JSON.stringify(home));
  record("Rejected overlay UI removed", home.forbidden === 0, JSON.stringify(home));
  record("Homepage images load", home.missingImages === 0, JSON.stringify(home.missingImageSources));
  record("Homepage desktop overflow", !home.overflow, String(home.overflow));
  const analyticsIdle = await page.evaluate(`({
    externalRequests: performance.getEntriesByType('resource').filter((entry) => /googletagmanager|google-analytics/i.test(entry.name)).map((entry) => entry.name),
    apiPresent: Boolean(window.bestEVillasAnalytics),
  })`);
  record("Analytics stays idle without Measurement ID", analyticsIdle.externalRequests.length === 0 && !analyticsIdle.apiPresent, JSON.stringify(analyticsIdle));
  await page.screenshot("home-desktop.png");

  const carouselState = await page.evaluate(`(async () => {
    document.querySelector('.carousel-next').click();
    const deadline = Date.now() + 8000;
    while ((document.querySelector('.hero-slide.active')?.dataset.slide !== '1' || document.querySelector('.carousel-count strong')?.textContent !== '02') && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 25));
    }
    return {
      slide: document.querySelector('.hero-slide.active')?.dataset.slide,
      count: document.querySelector('.carousel-count strong')?.textContent,
    };
  })()`);
  record("Carousel interaction", carouselState.slide === "1" && carouselState.count === "02", JSON.stringify(carouselState));
  const carouselKeyboardState = await page.evaluate(`(async () => {
    document.querySelector('.hero-carousel').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const deadline = Date.now() + 8000;
    while ((document.querySelector('.hero-slide.active')?.dataset.slide !== '2' || document.querySelector('.carousel-count strong')?.textContent !== '03') && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 25));
    }
    return {
      slide: document.querySelector('.hero-slide.active')?.dataset.slide,
      count: document.querySelector('.carousel-count strong')?.textContent,
    };
  })()`);
  record("Carousel keyboard interaction", carouselKeyboardState.slide === "2" && carouselKeyboardState.count === "03", JSON.stringify(carouselKeyboardState));
  await page.screenshot("home-carousel-desktop.png");

  await page.navigate(`${baseUrl}/villas.html`);
  const listingInitial = await page.evaluate(`({
    title: document.title,
    cards: Array.from(document.querySelectorAll('[data-villa-card]')).filter((card) => !card.hidden).length,
    count: document.querySelector('#villa-result-count')?.textContent,
    missingImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length,
    directLinks: Array.from(document.querySelectorAll('a[href*="direct-book.com"]')).length,
  })`);
  record("Villa listing rendered", listingInitial.title.includes("Villas") && listingInitial.cards === 4 && listingInitial.count === "4 accommodation options", JSON.stringify(listingInitial));
  record("Villa listing images load", listingInitial.missingImages === 0, `${listingInitial.missingImages} missing`);
  record("External booking links present", listingInitial.directLinks === 4, `${listingInitial.directLinks} links`);
  await page.screenshot("villas-desktop.png");

  const filtered = await page.evaluate(`(async () => {
    const form = document.querySelector('#villa-filter-form');
    form.querySelector('[name="location"]').value = 'south';
    form.querySelector('[name="bedrooms"]').value = '2';
    form.scrollIntoView({ block: 'start', behavior: 'instant' });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    form.querySelector('button[type="submit"]').click();
    const deadline = Date.now() + 3000;
    let headerBottom;
    let resultsTop;
    do {
      headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
      resultsTop = document.querySelector('#villa-results').getBoundingClientRect().top;
      const resultsOffset = resultsTop - headerBottom;
      if (document.activeElement?.id === 'villa-results-title' && resultsOffset >= 8 && resultsOffset <= 80) break;
      await new Promise((done) => setTimeout(done, 25));
    } while (Date.now() < deadline);
    return {
      visible: Array.from(document.querySelectorAll('[data-villa-card]')).filter((card) => !card.hidden).length,
      count: document.querySelector('#villa-result-count')?.textContent,
      url: location.href,
      activeId: document.activeElement?.id,
      resultsOffset: resultsTop - headerBottom,
    };
  })()`);
  record("Villa location filter", filtered.visible === 1
    && filtered.count === "1 accommodation option"
    && filtered.url.includes("location=south")
    && filtered.url.includes("bedrooms=2")
    && filtered.activeId === "villa-results-title"
    && filtered.resultsOffset >= 8
    && filtered.resultsOffset <= 80, JSON.stringify(filtered));
  await page.screenshot("villas-filtered-desktop.png");

  await page.navigate(`${baseUrl}/villa.html?villa=providence`);
  const detail = await page.evaluate(`({
    title: document.title,
    heading: document.querySelector('h1')?.textContent.trim(),
    bookingAction: document.querySelector('#external-booking-form')?.action,
    factCount: document.querySelectorAll('#villa-facts li').length,
    missingImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content,
    twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content,
    schema: JSON.parse(document.querySelector('#villa-structured-data')?.textContent || '{}'),
  })`);
  record("Villa template selects requested villa", detail.heading.includes("Providence Terrace") && detail.title.includes("Providence Terrace"), JSON.stringify(detail));
  record("Villa booking destination", detail.bookingAction === "https://direct-book.com/properties/bestevillaprovidencedirect", detail.bookingAction);
  record("Villa facts and gallery load", detail.factCount === 4 && detail.missingImages === 0, JSON.stringify(detail));
  record(
    "Villa SEO metadata selects requested villa",
    detail.canonical === "https://bestevillas.com/villa.html?villa=providence"
      && detail.ogUrl === detail.canonical
      && detail.twitterTitle.includes("Providence Terrace")
      && detail.schema.name.includes("Providence Terrace")
      && detail.schema.url === detail.canonical
      && detail.schema.numberOfBedrooms === 2
      && !("occupancy" in detail.schema)
      && !("priceRange" in detail.schema),
    JSON.stringify(detail),
  );

  const externalFormSafety = await page.evaluate(`({
    namedDateFields: document.querySelectorAll('#external-booking-form input[name]').length,
    guestClaim: document.querySelector('#villa-facts')?.textContent.toLowerCase().includes('guest'),
  })`);
  record("Booking form keeps verified base URL", externalFormSafety.namedDateFields === 0, JSON.stringify(externalFormSafety));
  record("Unconfirmed capacity is not published", !externalFormSafety.guestClaim, JSON.stringify(externalFormSafety));
  await page.screenshot("villa-detail-desktop.png");

  const villaVariants = [
    ["prospect-three", "Prospect", "https://bestevillas.com/villa.html?villa=prospect-three"],
    ["prospect-two", "Prospect", "https://bestevillas.com/villa.html?villa=prospect-two"],
    ["providence", "Providence Terrace", "https://bestevillas.com/villa.html?villa=providence"],
    ["st-silas", "St. Silas", "https://bestevillas.com/villa.html?villa=st-silas"],
  ];
  for (const [villaKey, headingText, expectedCanonical] of villaVariants) {
    await page.navigate(baseUrl + "/villa.html?villa=" + villaKey);
    const variant = await page.evaluate(`(() => {
      const schema = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => {
        try { return JSON.parse(node.textContent); } catch { return null; }
      });
      const schemaText = JSON.stringify(schema);
      return {
        heading: document.querySelector('h1')?.textContent.trim(),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        ogUrl: document.querySelector('meta[property="og:url"]')?.content,
        twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content,
        schemaValid: schema.every(Boolean),
        hasVacationRental: schemaText.includes('VacationRental'),
        bookingAction: document.querySelector('#external-booking-form')?.action,
        missingImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    })()`);
    record(
      "Villa variant " + villaKey,
      variant.heading?.includes(headingText) &&
        variant.canonical === expectedCanonical &&
        variant.ogUrl === expectedCanonical &&
        Boolean(variant.twitterTitle) &&
        variant.schemaValid &&
        variant.hasVacationRental &&
        /^https:\/\/direct-book\.com\//.test(variant.bookingAction || "") &&
        variant.missingImages === 0 &&
        !variant.overflow,
      JSON.stringify(variant),
    );
  }

  await page.navigate(baseUrl + "/villa.html?villa=providence");

  const galleryChange = await page.evaluate(`(() => {
    const before = document.querySelector('#villa-main-image').src;
    document.querySelector('[data-gallery-index="1"]').click();
    const after = document.querySelector('#villa-main-image').src;
    return { before, after, active: document.querySelector('.gallery-thumbnail.active')?.dataset.galleryIndex };
  })()`);
  record("Villa gallery interaction", galleryChange.before !== galleryChange.after && galleryChange.active === "1", JSON.stringify(galleryChange));
  await page.screenshot("villa-gallery-desktop.png");

  await page.setViewport(390, 844, true);
  await page.navigate(`${baseUrl}/index.html?qa=mobile`);
  const mobile = await page.evaluate(`(() => {
    const button = document.querySelector('.menu-toggle');
    const scrollBeforeMenu = window.scrollY;
    button.click();
    return {
      scrollBeforeMenu,
      scrollAfterMenu: window.scrollY,
      expanded: button.getAttribute('aria-expanded'),
      navDisplay: getComputedStyle(document.querySelector('.mobile-nav')).display,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      headingVisible: Boolean(document.querySelector('h1')?.getBoundingClientRect().height),
      availabilityBottom: document.querySelector('.booking-bar .search-button')?.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  })()`);
  record("Mobile menu interaction", mobile.scrollBeforeMenu === 0 && mobile.expanded === "true" && mobile.navDisplay !== "none", JSON.stringify(mobile));
  record("Homepage mobile layout", !mobile.overflow && mobile.headingVisible, JSON.stringify(mobile));
  record("Mobile availability CTA is visible", mobile.availabilityBottom <= mobile.viewportHeight, JSON.stringify(mobile));
  await page.screenshot("home-mobile-menu.png");

  const mobileClosed = await page.evaluate(`(() => {
    document.querySelector('.menu-toggle').click();
    window.scrollTo(0, 0);
    const hero = document.querySelector('.hero-carousel').getBoundingClientRect();
    const slides = document.querySelector('.hero-slides').getBoundingClientRect();
    const copy = document.querySelector('.hero-content').getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      hero: { top: hero.top, height: hero.height },
      slides: { top: slides.top, height: slides.height },
      copy: { top: copy.top, height: copy.height },
    };
  })()`);
  record("Mobile hero composition", mobileClosed.scrollY === 0 && mobileClosed.slides.height >= 380 && mobileClosed.copy.height > 150, JSON.stringify(mobileClosed));
  await page.screenshot("home-mobile.png");

  await page.navigate(`${baseUrl}/villas.html`);
  const mobileListing = await page.evaluate(`({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    cards: document.querySelectorAll('[data-villa-card]').length,
    h1: document.querySelector('h1')?.textContent.trim(),
  })`);
  record("Villa listing mobile layout", !mobileListing.overflow && mobileListing.cards === 4, JSON.stringify(mobileListing));
  await page.screenshot("villas-mobile.png");

  const mobileFilter = await page.evaluate(`(async () => {
    const form = document.querySelector('#villa-filter-form');
    form.querySelector('[name="location"]').value = 'south';
    form.querySelector('[name="bedrooms"]').value = '2';
    form.scrollIntoView({ block: 'start', behavior: 'instant' });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const beforeScrollY = scrollY;
    form.querySelector('button[type="submit"]').click();
    const deadline = Date.now() + 3000;
    let state;
    do {
      const visibleCards = Array.from(document.querySelectorAll('[data-villa-card]')).filter((card) => !card.hidden);
      const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
      const resultsTop = document.querySelector('#villa-results').getBoundingClientRect().top;
      const firstCardTop = visibleCards[0]?.getBoundingClientRect().top ?? null;
      state = {
        visible: visibleCards.length,
        visibleTitle: visibleCards[0]?.querySelector('h3')?.textContent?.trim(),
        count: document.querySelector('#villa-result-count')?.textContent?.trim(),
        url: location.href,
        activeId: document.activeElement?.id,
        beforeScrollY,
        afterScrollY: scrollY,
        resultsOffset: resultsTop - headerBottom,
        firstCardTop,
        viewportHeight: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
      if (state.activeId === 'villa-results-title' && state.resultsOffset >= 8 && state.resultsOffset <= 80 && state.firstCardTop < state.viewportHeight) break;
      await new Promise((done) => setTimeout(done, 25));
    } while (Date.now() < deadline);
    return state;
  })()`);
  record("Villa mobile Search villas reveals results", mobileFilter.visible === 1
    && mobileFilter.visibleTitle?.includes("Providence")
    && mobileFilter.count === "1 accommodation option"
    && mobileFilter.url.includes("location=south")
    && mobileFilter.url.includes("bedrooms=2")
    && mobileFilter.activeId === "villa-results-title"
    && mobileFilter.afterScrollY > mobileFilter.beforeScrollY
    && mobileFilter.resultsOffset >= 8
    && mobileFilter.resultsOffset <= 80
    && mobileFilter.firstCardTop < mobileFilter.viewportHeight
    && !mobileFilter.overflow, JSON.stringify(mobileFilter));
  await page.screenshot("villas-filtered-mobile.png");

  const internalPages = [
    ["locations.html", "Two coasts"],
    ["about.html", "A local welcome"],
    ["reviews.html", "Memories shared"],
    ["guide.html", "Plan a Barbados stay"],
    ["faq.html", "Questions, answered"],
    ["policies.html", "Booking policies"],
    ["contact.html", "Let’s talk"],
  ];

  await page.setViewport(1440, 1000);
  for (const [route, headingStart] of internalPages) {
    await page.navigate(`${baseUrl}/${route}`);
    const internal = await page.evaluate(`({
      heading: document.querySelector('h1')?.textContent.trim(),
      missingImages: Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    })`);
    record(`${route} renders`, internal.heading?.startsWith(headingStart) && internal.missingImages === 0 && !internal.overflow, JSON.stringify(internal));
  }

  await page.navigate(`${baseUrl}/faq.html`);
  const faqInteraction = await page.evaluate(`(() => {
    const disclosure = document.querySelector('.faq-list details');
    const summary = disclosure?.querySelector('summary');
    summary?.click();
    return { open: disclosure?.open, answerVisible: Boolean(disclosure?.querySelector('.faq-answer')?.getBoundingClientRect().height) };
  })()`);
  record("FAQ disclosure interaction", faqInteraction.open && faqInteraction.answerVisible, JSON.stringify(faqInteraction));
  await page.screenshot("faq-desktop.png");

  const relevantMessages = page.browserMessages.filter((message) => {
    if (message.level !== "error" && message.level !== "warning") return false;
    return !/favicon\.ico/i.test(`${message.text} ${message.url || ""}`);
  });
  record("Browser console health", relevantMessages.length === 0, JSON.stringify(relevantMessages));
} finally {
  await page.close();
}

const passed = results.filter((result) => result.passed).length;
const report = { passed, total: results.length, results };
await writeFile(resolve(evidenceDir, "browser-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
