import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSite } from "../scripts/build.mjs";

const root = resolve(".");
const sourcePath = resolve(root, "deployment", "apache-production.htaccess");
const requiredRedirects = new Map([
  ["index.html", "https://bestevillas.com/"],
  ["home", "https://bestevillas.com/"],
  ["villas", "https://bestevillas.com/villas.html"],
  ["reviews", "https://bestevillas.com/reviews.html"],
  ["about-us", "https://bestevillas.com/about.html"],
  ["contact-us", "https://bestevillas.com/contact.html"],
  ["book", "https://bestevillas.com/villas.html"],
  ["gallery", "https://bestevillas.com/villas.html"],
  ["blog", "https://bestevillas.com/guide.html"],
  ["privacy-policy", "https://bestevillas.com/privacy.html"],
  ["privacy-policy-2", "https://bestevillas.com/privacy.html"],
  ["wp-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["sitemap_index.xml", "https://bestevillas.com/sitemap.xml"],
  ["post-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["page-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["product-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["team-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["category-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["product_cat-sitemap.xml", "https://bestevillas.com/sitemap.xml"],
  ["prospect-3-bedrooms", "https://bestevillas.com/villas/prospect-three.html"],
  ["prospect-2-bedroom-units", "https://bestevillas.com/villas/prospect-two.html"],
  ["providence-terrace-2-bedroom-units", "https://bestevillas.com/villas/providence.html"],
  ["st-silas-3-bedroom-units", "https://bestevillas.com/villas/st-silas.html"],
  [
    "barbados-attractions-dive-into-adventure-with-best-e-villas",
    "https://bestevillas.com/guide/barbados-attractions-dive-into-adventure-with-best-e-villas.html",
  ],
]);
const retiredRootSlugs = [
  "demo",
  "sample-page",
  "error",
  "thank-you",
  "shop",
  "cart",
  "cart-2",
  "checkout",
  "checkout-2",
  "my-account",
  "my-account-2",
  "refund_returns-2",
  "swimming",
  "fitness",
  "spa-center",
  "how-to-travel-with-paper-map-2",
  "nature-holiday-quotes",
  "introducing-this-amazing-tour",
  "dinner-at-5-star-hotel",
  "how-to-booking-room-online",
  "pack-wisely-before-traveling",
  "hello-world",
  "single-room",
  "single-room-2",
  "standard-room",
  "standard-room-2",
  "couble-room",
  "deluxe-room",
  "family-room",
  "vip-room",
  "vintage-room",
  "double-room",
  "uncategorized",
  "restaurant",
  "tourist",
  "travel",
  "romancy",
  "balcony",
  "ground-floor",
];
const legacySitemapGroups = {
  posts: [
    "blog",
    "how-to-travel-with-paper-map-2",
    "nature-holiday-quotes",
    "introducing-this-amazing-tour",
    "dinner-at-5-star-hotel",
    "how-to-booking-room-online",
    "pack-wisely-before-traveling",
    "hello-world",
  ],
  pages: [
    "",
    "contact-us",
    "villas",
    "reviews",
    "about-us",
    "providence-terrace-2-bedroom-units",
    "prospect-3-bedrooms",
    "prospect-2-bedroom-units",
    "st-silas-3-bedroom-units",
    "book",
    "gallery",
    "home",
    "barbados-attractions-dive-into-adventure-with-best-e-villas",
    "demo",
    "shop",
    "cart",
    "checkout",
    "my-account",
    "sample-page",
    "error",
    "thank-you",
    "swimming",
    "fitness",
    "spa-center",
    "room-listing-3",
    "room-listing-2",
    "room-listing-1",
    "refund_returns-2",
    "checkout-2",
    "my-account-2",
    "rooms",
    "cart-2",
    "privacy-policy-2",
  ],
  products: ["shop", "single-room", "standard-room", "couble-room", "standard-room-2", "deluxe-room", "single-room-2", "family-room", "vip-room", "vintage-room", "double-room"],
  team: ["team", "team/kevin-martin", "team/sarah-albert", "team/david-cooper", "team/jessica-brown", "team/mike-hardson", "team/dianne-russell"],
  categories: ["uncategorized", "restaurant", "tourist", "travel"],
  productCategories: ["romancy", "balcony", "ground-floor"],
};
const redirectExpectations = new Map([
  ...requiredRedirects,
  ["rooms", "https://bestevillas.com/villas.html"],
  ["room-listing-1", "https://bestevillas.com/villas.html"],
  ["room-listing-2", "https://bestevillas.com/villas.html"],
  ["room-listing-3", "https://bestevillas.com/villas.html"],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function routeOutcome(source, slug) {
  const routeRules = source.slice(0, source.indexOf("# Normalize every remaining host"));
  for (const match of routeRules.matchAll(/^\s*RewriteRule\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]/gm)) {
    const [, pattern, target, flags] = match;
    const matcher = new RegExp(pattern, flags.split(",").includes("NC") ? "i" : "");
    if (!matcher.test(slug)) continue;
    if (flags.split(",").includes("G")) return { status: 410, flags };
    if (flags.split(",").includes("R=301")) return { status: 301, target, flags };
  }
  return { status: 200 };
}

function productionFileFor(target) {
  const path = new URL(target).pathname.replace(/^\/+/, "");
  return path ? path : "index.html";
}

let temporaryRoot;
try {
  const source = await readFile(sourcePath, "utf8");
  assert(!/^\s*RedirectMatch\s+301\s+\^\/?.*\/?\$\s+https:\/\/bestevillas\.com\/?\s*$/mi.test(source), "Blanket homepage redirect is not allowed.");
  assert(/^Options -Indexes -MultiViews$/m.test(source), "Apache directory indexing and MultiViews must be disabled.");
  assert(/RewriteCond %\{HTTP_HOST\} !\^bestevillas\\\.com\$ \[NC\]\s*RewriteRule \^ https:\/\/bestevillas\.com%\{REQUEST_URI\} \[R=301,L,NE\]/m.test(source), "Apex-host canonicalization rule is missing or unsafe.");
  assert(/RewriteCond %\{HTTPS\} !=on\s*RewriteCond %\{HTTP:X-Forwarded-Proto\} !\^https\$ \[NC\]\s*RewriteRule \^ https:\/\/bestevillas\.com%\{REQUEST_URI\} \[R=301,L,NE\]/m.test(source), "Proxy-aware HTTPS canonicalization rule is missing or unsafe.");
  assert((source.match(/RewriteRule\s+\^villa\\\.html\$/g) || []).length === 4, "All four query-based villa redirects are required.");
  assert((source.match(/\[R=301,L,NE,QSD\]/g) || []).length === 4, "Query-based villa redirects must discard legacy query strings.");

  for (const [slug, expected] of requiredRedirects) {
    const found = routeOutcome(source, slug);
    assert(found.status === 301, `Missing legacy redirect for ${slug}.`);
    assert(found.target === expected, `Legacy redirect for ${slug} targets ${found.target}; expected ${expected}.`);
    assert(/(?:^|,)R=301(?:,|$)/i.test(found.flags) && /(?:^|,)L(?:,|$)/i.test(found.flags), `Legacy redirect for ${slug} must be a terminal 301.`);
  }

  for (const fragment of ["demo", "shop", "cart", "checkout", "my-account", "product", "product-category", "team", "category"]) {
    assert(new RegExp(`RewriteRule[^\\n]*${escaped(fragment)}[^\\n]*\\[G,L,NC\\]`, "i").test(source), `Missing 410 retirement coverage for ${fragment}.`);
  }
  for (const slug of retiredRootSlugs) {
    assert(routeOutcome(source, slug).status === 410, `Missing explicit 410 retirement coverage for ${slug}.`);
  }

  const legacySitemapSlugs = [...new Set(Object.values(legacySitemapGroups).flat())];
  assert(legacySitemapSlugs.length === 65, `Expected the complete 65-URL legacy sitemap matrix; found ${legacySitemapSlugs.length}.`);
  for (const slug of legacySitemapSlugs) {
    const outcome = routeOutcome(source, slug);
    if (slug === "") {
      assert(outcome.status === 200, "The canonical homepage must remain a served route.");
    } else if (redirectExpectations.has(slug)) {
      assert(outcome.status === 301 && outcome.target === redirectExpectations.get(slug), `Legacy ${slug} must redirect directly to ${redirectExpectations.get(slug)}.`);
    } else {
      assert(outcome.status === 410, `Legacy debris ${slug} must return 410; received ${outcome.status}.`);
    }
  }

  const firstMappedRedirect = source.indexOf("RewriteRule ^home/?$");
  const canonicalRedirect = source.indexOf("RewriteRule ^ https://bestevillas.com%{REQUEST_URI}");
  assert(firstMappedRedirect >= 0 && canonicalRedirect > firstMappedRedirect, "Legacy mappings must precede canonical host/scheme normalization for one-hop redirects.");

  temporaryRoot = await mkdtemp(join(tmpdir(), "bestevillas-redirect-audit-"));
  const productionOut = resolve(temporaryRoot, "production");
  const previewOut = resolve(temporaryRoot, "preview");
  await buildSite({ mode: "production", basePath: "/", out: productionOut });
  await buildSite({ mode: "preview", basePath: "/bestevillas-mockup/", out: previewOut });

  const productionArtifact = resolve(productionOut, ".htaccess");
  const previewArtifact = resolve(previewOut, ".htaccess");
  assert(await exists(productionArtifact), "Production build did not include .htaccess.");
  assert(!(await exists(previewArtifact)), "Preview build must not include the production Apache configuration.");
  assert((await readFile(productionArtifact, "utf8")) === source, "Production .htaccess does not match the reviewed source artifact.");
  for (const target of new Set(redirectExpectations.values())) {
    assert(await exists(resolve(productionOut, productionFileFor(target))), `Redirect destination is missing from the production build: ${target}.`);
  }

  const passed = 13 + requiredRedirects.size * 3 + retiredRootSlugs.length + legacySitemapSlugs.length + new Set(redirectExpectations.values()).size;
  console.log(JSON.stringify({ passed, total: passed, productionArtifact: true, previewArtifact: false }, null, 2));
} finally {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}
