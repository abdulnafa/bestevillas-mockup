import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "https://bestevillas.com";
const routes = new Map([
  ["index.html", `${origin}/`],
  ["villas.html", `${origin}/villas.html`],
  ["villa.html", `${origin}/villa.html?villa=prospect-three`],
  ["locations.html", `${origin}/locations.html`],
  ["about.html", `${origin}/about.html`],
  ["reviews.html", `${origin}/reviews.html`],
  ["guide.html", `${origin}/guide.html`],
  ["faq.html", `${origin}/faq.html`],
  ["policies.html", `${origin}/policies.html`],
  ["contact.html", `${origin}/contact.html`],
]);
const results = [];

function record(page, check, passed, detail = "") {
  results.push({ page, check, passed, detail });
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const [page, canonical] of routes) {
  const html = await readFile(resolve(page), "utf8");
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const requiredProperties = ["og:title", "og:description", "og:url", "og:image", "og:image:alt", "og:type", "og:site_name", "og:locale"];
  const requiredNames = ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"];

  record(page, "preview noindex retained", /<meta\s+name=["']robots["']\s+content=["']noindex, nofollow["']/i.test(html));
  record(page, "canonical", new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${escaped(canonical)}["']`, "i").test(html), canonical);
  for (const property of requiredProperties) {
    record(page, property, new RegExp(`<meta\\s+property=["']${escaped(property)}["']\\s+content=["'][^"']+["']`, "i").test(html));
  }
  for (const name of requiredNames) {
    record(page, name, new RegExp(`<meta\\s+name=["']${escaped(name)}["']\\s+content=["'][^"']+["']`, "i").test(html));
  }
  record(page, "absolute social URL", [...html.matchAll(/<meta\s+(?:property|name)=["'](?:og:url|og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi)].every((match) => match[1].startsWith(origin)));
  record(page, "analytics ready but inactive", /<script\s+src=["']analytics\.js["']\s+data-ga-measurement-id=["']["']\s+defer><\/script>/i.test(html));
  record(page, "JSON-LD present", jsonLdBlocks.length > 0, `${jsonLdBlocks.length} blocks`);
  for (const [index, block] of jsonLdBlocks.entries()) {
    try {
      const data = JSON.parse(block[1]);
      record(page, `JSON-LD ${index + 1} parses`, data["@context"] === "https://schema.org");
    } catch (error) {
      record(page, `JSON-LD ${index + 1} parses`, false, error.message);
    }
  }
}

const sitemap = await readFile(resolve("sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
record("sitemap.xml", "13 production URLs", sitemapUrls.length === 13, String(sitemapUrls.length));
record("sitemap.xml", "single canonical origin", sitemapUrls.every((url) => url.startsWith(`${origin}/`)));
record("sitemap.xml", "four villa URLs", sitemapUrls.filter((url) => url.includes("villa.html?villa=")).length === 4);

const robots = await readFile(resolve("robots.txt"), "utf8");
record("robots.txt", "production crawl allowed", /^Allow:\s*\/$/m.test(robots));
record("robots.txt", "production sitemap declared", robots.includes(`Sitemap: ${origin}/sitemap.xml`));

const analytics = await readFile(resolve("analytics.js"), "utf8");
record("analytics.js", "valid GA4 guard", analytics.includes("/^G-[A-Z0-9]+$/i"));
record("analytics.js", "consent defaults denied", analytics.includes('analytics_storage: "denied"'));
record("analytics.js", "booking event hook", analytics.includes('"booking_partner_click"'));

const failed = results.filter((result) => !result.passed);
const report = { passed: results.length - failed.length, total: results.length, failed, results };
await writeFile(resolve(process.env.TEST_EVIDENCE_DIR || "testing/evidence", "seo-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
