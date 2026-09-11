import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const root = resolve(".");
const evidencePath = resolve("testing", "evidence", "static-audit.json");
const pages = [
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
];

const results = [];

await mkdir(dirname(evidencePath), { recursive: true });

function record(page, check, passed, detail = "") {
  results.push({ page, check, passed, detail });
}

function matches(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

for (const page of pages) {
  const absolutePage = resolve(root, page);
  const html = await readFile(absolutePage, "utf8");
  const ids = matches(html, /\bid=["']([^"']+)["']/gi);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const imagesWithoutAlt = images.filter((image) => !/\balt=["'][^"']*["']/i.test(image));
  const blankTargetLinks = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)].map((match) => match[0]);
  const unsafeBlankLinks = blankTargetLinks.filter((link) => !/\brel=["'][^"']*noopener[^"']*["']/i.test(link));

  record(page, "one h1", h1Count === 1, `found ${h1Count}`);
  record(page, "unique ids", duplicateIds.length === 0, duplicateIds.join(", "));
  record(page, "image alt text", imagesWithoutAlt.length === 0, `${imagesWithoutAlt.length} missing`);
  record(page, "safe new tabs", unsafeBlankLinks.length === 0, `${unsafeBlankLinks.length} missing noopener`);
  record(page, "title", /<title>[^<]+<\/title>/i.test(html));
  record(page, "meta description", /<meta\s+name=["']description["']/i.test(html) || /<meta[\s\S]*?name=["']description["']/i.test(html));
  record(page, "preview noindex", /<meta\s+name=["']robots["']\s+content=["']noindex, nofollow["']/i.test(html));
  record(page, "no stale booking dates", !/direct-book\.com[^"']*(2024|checkin|checkout|check-in|check-out)/i.test(html));
  record(page, "no template copy", !/(lorem ipsum|john smith|ovaTheme|CEO Romancy|hello world)/i.test(html));

  const references = matches(html, /\b(?:href|src)=["']([^"']+)["']/gi);
  for (const reference of references) {
    if (/^(?:https?:|mailto:|tel:|#|data:|javascript:)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0];
    if (!clean || !extname(clean)) continue;
    const target = resolve(dirname(absolutePage), clean);
    let exists = true;
    try {
      await access(target);
    } catch {
      exists = false;
    }
    record(page, `local reference: ${clean}`, exists, exists ? "" : target);
  }
}

const failed = results.filter((result) => !result.passed);
const report = {
  passed: results.length - failed.length,
  total: results.length,
  failed,
  results,
};

await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
