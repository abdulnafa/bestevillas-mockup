import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4173";
const debugUrl = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223";
const evidenceDir = resolve(process.env.TEST_EVIDENCE_DIR || "testing/evidence");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail: String(detail || "") });
}

async function openPage(url) {
  const response = await fetch(`${debugUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create browser tab: HTTP ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const eventWaiters = new Map();
  const messages = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result);
      return;
    }
    if (message.method === "Log.entryAdded") messages.push(message.params.entry);
    if (message.method === "Runtime.exceptionThrown") messages.push({ level: "error", text: message.params.exceptionDetails?.text || "Uncaught runtime exception" });
    const waiters = eventWaiters.get(message.method) || [];
    waiters.forEach((waiter) => waiter(message.params));
    eventWaiters.delete(message.method);
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
      const waiters = eventWaiters.get(method) || [];
      waiters.push((params) => {
        clearTimeout(timeout);
        resolveEvent(params);
      });
      eventWaiters.set(method, waiters);
    });
  }

  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
    return response.result.value;
  }

  async function navigate(path) {
    const loaded = waitFor("Page.loadEventFired");
    await send("Page.navigate", { url: `${baseUrl}/${path.replace(/^\/+/, "")}` });
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

  async function reducedMotion(reduce) {
    await send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
    });
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
  return { close, evaluate, messages, navigate, reducedMotion, screenshot, viewport };
}

const shellProbe = `(async () => {
  const waitFrames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const header = document.querySelector('.site-header');
  const logo = document.querySelector('.site-header .brand-logo');
  if (!header || !logo) return { missing: true };
  const initialHeader = header.getBoundingClientRect();
  const initialLogo = logo.getBoundingClientRect();
  const initialHeight = initialHeader.height;
  const reveals = Array.from(document.querySelectorAll('.reveal'));
  const hiddenAboveFold = reveals.filter((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < innerHeight * 0.9 && getComputedStyle(element).opacity === '0';
  }).length;
  window.scrollTo({ top: Math.min(700, Math.max(0, document.documentElement.scrollHeight - innerHeight)), behavior: 'instant' });
  await waitFrames();
  const scrolledHeader = header.getBoundingClientRect();
  const scrolledLogo = logo.getBoundingClientRect();
  return {
    missing: false,
    position: getComputedStyle(header).position,
    initialTop: initialHeader.top,
    scrolledTop: scrolledHeader.top,
    initialHeight,
    scrolledHeight: scrolledHeader.height,
    scrolledClass: header.classList.contains('is-scrolled'),
    logoReady: logo.complete && logo.naturalWidth === 1015 && logo.naturalHeight === 245,
    logoWidth: scrolledLogo.width,
    logoHeight: scrolledLogo.height,
    logoContained: scrolledLogo.left >= scrolledHeader.left - 1 && scrolledLogo.right <= scrolledHeader.right + 1 && scrolledLogo.top >= scrolledHeader.top - 1 && scrolledLogo.bottom <= scrolledHeader.bottom + 1,
    revealCount: reveals.length,
    hiddenAboveFold,
    overflow: document.documentElement.scrollWidth > innerWidth,
    smooth: getComputedStyle(document.documentElement).scrollBehavior,
    viewport: { width: innerWidth, height: innerHeight },
  };
})()`;

function shellHealthy(state) {
  return !state.missing
    && state.position === "sticky"
    && Math.abs(state.initialTop) <= 1
    && Math.abs(state.scrolledTop) <= 1
    && Math.abs(state.initialHeight - state.scrolledHeight) <= 1
    && state.scrolledClass
    && state.logoReady
    && state.logoWidth >= 150
    && state.logoWidth <= 270
    && state.logoHeight > 30
    && state.logoContained
    && state.revealCount > 0
    && state.hiddenAboveFold === 0
    && !state.overflow
    && state.smooth === "smooth";
}

await mkdir(evidenceDir, { recursive: true });

const page = await openPage(`${baseUrl}/index.html`);
try {
  await page.reducedMotion(false);
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
    await page.viewport(1440, 1000);
    await page.navigate(route);
    const state = await page.evaluate(shellProbe);
    record(`Desktop sticky shell and logo: ${route}`, shellHealthy(state), JSON.stringify(state));
  }

  await page.viewport(1440, 1000);
  await page.navigate("index.html");
  await page.screenshot("header-logo-home-desktop.png");

  const breakpoints = [
    ["index.html", 981, false, true],
    ["index.html", 980, true, false],
    ["locations.html", 861, false, true],
    ["locations.html", 860, true, false],
    ["locations.html", 740, true, false],
    ["locations.html", 390, true, false],
  ];
  for (const [route, width, expectToggle, expectDesktopNav] of breakpoints) {
    await page.viewport(width, 900, width <= 740);
    await page.navigate(`${route}?breakpoint=${width}`);
    const state = await page.evaluate(`(() => {
      const header = document.querySelector('.site-header');
      const logo = header?.querySelector('.brand-logo');
      const toggle = header?.querySelector('.menu-toggle');
      const nav = header?.querySelector('.desktop-nav');
      const headerRect = header?.getBoundingClientRect();
      const logoRect = logo?.getBoundingClientRect();
      return {
        sticky: getComputedStyle(header).position,
        logoReady: Boolean(logo?.complete && logo.naturalWidth === 1015),
        logoContained: Boolean(logoRect && headerRect && logoRect.left >= headerRect.left - 1 && logoRect.right <= headerRect.right + 1 && logoRect.top >= headerRect.top - 1 && logoRect.bottom <= headerRect.bottom + 1),
        toggleVisible: Boolean(toggle && getComputedStyle(toggle).display !== 'none'),
        togglePosition: toggle ? getComputedStyle(toggle).position : null,
        navVisible: Boolean(nav && getComputedStyle(nav).display !== 'none'),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    const passed = state.sticky === "sticky" && state.logoReady && state.logoContained && state.toggleVisible === expectToggle && state.navVisible === expectDesktopNav && (!expectToggle || state.togglePosition === "static") && !state.overflow;
    record(`Responsive header breakpoint: ${route} at ${width}px`, passed, JSON.stringify(state));
  }

  await page.viewport(390, 844, true);
  await page.navigate("index.html?mobile-menu=1");
  const menu = await page.evaluate(`(async () => {
    const waitFrames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.site-header > .mobile-nav');
    window.scrollTo({ top: 500, behavior: 'instant' });
    await waitFrames();
    toggle.click();
    await waitFrames();
    const headerRect = header.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const opened = {
      headerTop: headerRect.top,
      expanded: toggle.getAttribute('aria-expanded'),
      hidden: nav.getAttribute('aria-hidden'),
      display: getComputedStyle(nav).display,
      bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
      navContained: navRect.left >= -1 && navRect.right <= innerWidth + 1 && navRect.top >= headerRect.bottom - 1 && navRect.bottom <= innerHeight + 1,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFrames();
    return { opened, closedExpanded: toggle.getAttribute('aria-expanded'), closedDisplay: getComputedStyle(nav).display };
  })()`);
  record("Mobile sticky drawer remains contained and closes with Escape", Math.abs(menu.opened.headerTop) <= 1 && menu.opened.expanded === "true" && menu.opened.hidden === "false" && menu.opened.display !== "none" && menu.opened.bodyLocked && menu.opened.navContained && !menu.opened.overflow && menu.closedExpanded === "false" && menu.closedDisplay === "none", JSON.stringify(menu));
  await page.navigate("index.html?mobile-proof=1");
  await page.evaluate(`document.querySelector('.menu-toggle')?.click()`);
  await page.screenshot("header-logo-mobile-menu.png");

  const anchors = [
    ["index.html#booking", "#booking"],
    ["villas.html#villa-results", "#villa-results"],
    ["villas/prospect-three.html#availability", "#availability"],
  ];
  await page.viewport(1366, 900);
  for (const [route, selector] of anchors) {
    await page.navigate(route);
    const state = await page.evaluate(`(async () => {
      await new Promise((done) => setTimeout(done, 800));
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const target = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { headerBottom: header.bottom, targetTop: target.top, delta: target.top - header.bottom, hash: location.hash };
    })()`);
    record(`Sticky-header anchor clearance: ${route}`, state.hash === selector && state.delta >= 8 && state.delta <= 80, JSON.stringify(state));
  }

  await page.viewport(1366, 900);
  await page.navigate("locations.html?motion=normal");
  const reveal = await page.evaluate(`(async () => {
    const wait = (duration) => new Promise((done) => setTimeout(done, duration));
    const targets = Array.from(document.querySelectorAll('.reveal'));
    const hiddenAboveFold = targets.filter((element) => { const rect = element.getBoundingClientRect(); return rect.top < innerHeight * 0.9 && rect.bottom > 0 && getComputedStyle(element).opacity === '0'; }).length;
    const target = targets.find((element) => !element.classList.contains('visible') && element.getBoundingClientRect().top > innerHeight);
    if (!target) return { missing: true, count: targets.length, hiddenAboveFold };
    const before = { opacity: getComputedStyle(target).opacity, transform: getComputedStyle(target).transform, visible: target.classList.contains('visible') };
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    await wait(750);
    const after = { opacity: getComputedStyle(target).opacity, transform: getComputedStyle(target).transform, visible: target.classList.contains('visible') };
    return { missing: false, count: targets.length, hiddenAboveFold, before, after };
  })()`);
  record("Subtle reveal motion is progressive and completes on entry", !reveal.missing && reveal.count > 0 && reveal.hiddenAboveFold === 0 && reveal.before.opacity === "0" && reveal.before.transform !== "none" && !reveal.before.visible && reveal.after.opacity === "1" && reveal.after.visible, JSON.stringify(reveal));

  await page.reducedMotion(true);
  await page.navigate("locations.html?motion=reduced");
  const reduced = await page.evaluate(`(() => {
    const targets = Array.from(document.querySelectorAll('.reveal'));
    return {
      media: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      motionReady: document.documentElement.classList.contains('motion-ready'),
      count: targets.length,
      allVisible: targets.every((element) => getComputedStyle(element).opacity === '1' && getComputedStyle(element).transform === 'none'),
      maxTransitionMs: Math.max(0, ...targets.map((element) => Math.max(...getComputedStyle(element).transitionDuration.split(',').map((value) => Number.parseFloat(value) * (value.includes('ms') ? 1 : 1000))))),
    };
  })()`);
  record("Reduced-motion preference disables smooth/reveal motion", reduced.media && reduced.scrollBehavior === "auto" && !reduced.motionReady && reduced.count > 0 && reduced.allVisible && reduced.maxTransitionMs <= 1, JSON.stringify(reduced));
  await page.reducedMotion(false);

  const relevantMessages = page.messages.filter((message) => ["error", "warning"].includes(message.level) && !/favicon\.ico/i.test(`${message.text || ""} ${message.url || ""}`));
  record("Header and motion browser console health", relevantMessages.length === 0, JSON.stringify(relevantMessages));
} finally {
  await page.close();
}

const failed = results.filter((result) => !result.passed);
const report = { generatedAt: new Date().toISOString(), passed: results.length - failed.length, total: results.length, failed, results };
await writeFile(resolve(evidenceDir, "header-motion-browser-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
