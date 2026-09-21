import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import vm from "node:vm";

const root = resolve(".");
const evidencePath = resolve(process.env.TEST_EVIDENCE_DIR || "testing/evidence", "production-readiness-audit.json");
const productionOrigin = "https://bestevillas.com";
const results = [];

const pageSpecs = [
  { file: "index.html", schema: ["WebSite", "LodgingBusiness", "Organization"] },
  { file: "villas.html", schema: ["CollectionPage", "ItemList"] },
  { file: "villa.html", schema: ["VacationRental", "LodgingBusiness", "Accommodation"] },
  { file: "locations.html", schema: ["CollectionPage", "WebPage", "Place"] },
  { file: "about.html", schema: ["AboutPage", "Organization"] },
  { file: "reviews.html", schema: ["CollectionPage", "WebPage", "ItemList"] },
  { file: "guide.html", schema: ["Blog", "CollectionPage", "WebPage"] },
  { file: "faq.html", schema: ["FAQPage"] },
  { file: "policies.html", schema: ["WebPage"] },
  { file: "contact.html", schema: ["ContactPage", "Organization"] },
];

function record(area, target, check, passed, detail = "", severity = "required") {
  results.push({ area, target, check, passed, detail, severity });
}

async function exists(relativePath) {
  try {
    await access(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readRequired(relativePath, area) {
  const present = await exists(relativePath);
  record(area, relativePath, "file exists", present);
  return present ? readFile(resolve(root, relativePath), "utf8") : null;
}

function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() ?? null;
}

function matchingTags(source, name, attributeName, value) {
  return tags(source, name).filter((tag) => attribute(tag, attributeName)?.toLowerCase() === value.toLowerCase());
}

function schemaTypes(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => schemaTypes(item, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const type = value["@type"];
  if (Array.isArray(type)) type.forEach((item) => found.add(String(item)));
  else if (type) found.add(String(type));
  Object.values(value).forEach((item) => schemaTypes(item, found));
  return found;
}

function isProductionUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.origin === productionOrigin;
  } catch {
    return false;
  }
}

function accessibleControl(source, tag, offset) {
  if (attribute(tag, "aria-label") || attribute(tag, "aria-labelledby") || attribute(tag, "title")) return true;
  const id = attribute(tag, "id");
  if (id) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`<label\\b[^>]*\\bfor=["']${escaped}["']`, "i").test(source)) return true;
  }
  const before = source.slice(0, offset).toLowerCase();
  return before.lastIndexOf("<label") > before.lastIndexOf("</label>");
}

function hasAccessibleName(tag) {
  if (attribute(tag, "aria-label") || attribute(tag, "aria-labelledby") || attribute(tag, "title")) return true;
  const text = tag
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(text);
}

function frontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return null;
  return { yaml: normalized.slice(4, end), body: normalized.slice(end + 5).trim() };
}

function topLevelKeys(yaml) {
  return new Set([...yaml.matchAll(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s|$)/gm)].map((match) => match[1]));
}

function simpleYamlValue(yaml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = yaml.match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "m"));
  return match?.[1]?.replace(/^(["'])(.*)\1$/, "$2") ?? "";
}

function yamlSection(yaml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = yaml.match(new RegExp(`^${escaped}:.*(?:\\n(?![A-Za-z_][A-Za-z0-9_-]*:)[^\\n]*)*`, "m"));
  return match?.[0] ?? "";
}

async function markdownFiles(relativeDirectory) {
  if (!(await exists(relativeDirectory))) return [];
  const entries = await readdir(resolve(root, relativeDirectory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase() !== "readme.md" && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => `${relativeDirectory}/${entry.name}`.replace(/\\/g, "/"));
}

await mkdir(dirname(evidencePath), { recursive: true });

const canonicalValues = [];
for (const spec of pageSpecs) {
  const html = await readRequired(spec.file, "page");
  if (!html) continue;

  record("seo", spec.file, "English document language", /<html\b[^>]*\blang=["']en(?:-[A-Za-z]+)?["']/i.test(html));
  record("seo", spec.file, "one non-empty title", (html.match(/<title>[^<]+<\/title>/gi) || []).length === 1);

  const descriptions = matchingTags(html, "meta", "name", "description");
  record("seo", spec.file, "one meta description", descriptions.length === 1 && Boolean(attribute(descriptions[0], "content")), `${descriptions.length} found`);

  const robots = matchingTags(html, "meta", "name", "robots");
  record(
    "seo",
    spec.file,
    "preview remains noindex",
    robots.length === 1 && attribute(robots[0], "content")?.toLowerCase() === "noindex, nofollow",
    robots.map((tag) => attribute(tag, "content")).join(", "),
  );

  const canonicals = matchingTags(html, "link", "rel", "canonical");
  const canonical = canonicals.length === 1 ? attribute(canonicals[0], "href") : null;
  record("seo", spec.file, "one absolute production canonical", Boolean(canonical && isProductionUrl(canonical)), canonical || `${canonicals.length} found`);
  if (canonical) canonicalValues.push(canonical);

  const ogRequirements = ["title", "description", "url", "image", "image:alt", "type", "site_name", "locale"];
  const og = Object.fromEntries(
    ogRequirements.map((name) => {
      const found = matchingTags(html, "meta", "property", `og:${name}`);
      return [name, found];
    }),
  );
  const completeOg = ogRequirements.every((name) => og[name].length === 1 && Boolean(attribute(og[name][0], "content")));
  record("seo", spec.file, "complete unique Open Graph metadata", completeOg, ogRequirements.filter((name) => og[name].length !== 1).join(", "));
  record("seo", spec.file, "Open Graph URL matches canonical", Boolean(canonical && attribute(og.url?.[0] || "", "content") === canonical));
  record("seo", spec.file, "Open Graph image is absolute", isProductionUrl(attribute(og.image?.[0] || "", "content") || ""));

  const twitterRequirements = ["card", "title", "description", "image", "image:alt"];
  const twitter = Object.fromEntries(
    twitterRequirements.map((name) => {
      const found = matchingTags(html, "meta", "name", `twitter:${name}`);
      return [name, found];
    }),
  );
  const completeTwitter = twitterRequirements.every((name) => twitter[name].length === 1 && Boolean(attribute(twitter[name][0], "content")));
  record("seo", spec.file, "complete unique Twitter metadata", completeTwitter, twitterRequirements.filter((name) => twitter[name].length !== 1).join(", "));
  record("seo", spec.file, "Twitter image is absolute", isProductionUrl(attribute(twitter.image?.[0] || "", "content") || ""));

  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsedSchemas = [];
  const parseFailures = [];
  for (const block of jsonLdBlocks) {
    try {
      parsedSchemas.push(JSON.parse(block[1].trim()));
    } catch (error) {
      parseFailures.push(error.message);
    }
  }
  record("seo", spec.file, "JSON-LD exists and parses", jsonLdBlocks.length > 0 && parseFailures.length === 0, parseFailures.join("; "));
  const types = [...schemaTypes(parsedSchemas)];
  record("seo", spec.file, "route-appropriate schema type", spec.schema.some((type) => types.includes(type)), `found: ${types.join(", ") || "none"}`);

  const analyticsTags = tags(html, "script").filter((tag) => (attribute(tag, "src") || "").replace(/^\.\//, "") === "analytics.js");
  record("analytics", spec.file, "one local analytics hook", analyticsTags.length === 1, `${analyticsTags.length} found`);
  record(
    "analytics",
    spec.file,
    "measurement ID intentionally empty",
    analyticsTags.length === 1 && attribute(analyticsTags[0], "data-ga-measurement-id") === "",
    analyticsTags.length ? String(attribute(analyticsTags[0], "data-ga-measurement-id")) : "hook missing",
  );
  const externalAnalytics = tags(html, "script").filter((tag) => /googletagmanager|google-analytics/i.test(attribute(tag, "src") || ""));
  record("analytics", spec.file, "no unconditional external analytics script", externalAnalytics.length === 0, `${externalAnalytics.length} found`);

  const skipLinks = tags(html, "a").filter((tag) => /\bskip-link\b/i.test(attribute(tag, "class") || ""));
  const skipTarget = skipLinks.length === 1 ? attribute(skipLinks[0], "href")?.replace(/^#/, "") : null;
  record("accessibility", spec.file, "skip link targets main content", Boolean(skipTarget && new RegExp(`<main\\b[^>]*\\bid=["']${skipTarget}["']`, "i").test(html)));
  record("accessibility", spec.file, "one h1", (html.match(/<h1\b/gi) || []).length === 1);

  const images = tags(html, "img");
  const missingAlts = images.filter((tag) => attribute(tag, "alt") === null);
  record("accessibility", spec.file, "every image has alt", missingAlts.length === 0, `${missingAlts.length} missing`);

  const formControls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)];
  const unlabeled = formControls.filter((match) => {
    const type = attribute(match[0], "type")?.toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;
    return !accessibleControl(html, match[0], match.index);
  });
  record("accessibility", spec.file, "form controls have labels", unlabeled.length === 0, `${unlabeled.length} unlabeled`);

  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map((match) => match[0]);
  const unnamedButtons = buttons.filter((tag) => !hasAccessibleName(tag));
  record("accessibility", spec.file, "buttons have accessible names", unnamedButtons.length === 0, `${unnamedButtons.length} unnamed`);

  const imageWithoutDimensions = images.filter((tag) => attribute(tag, "width") === null || attribute(tag, "height") === null);
  record(
    "performance",
    spec.file,
    "images reserve intrinsic space",
    imageWithoutDimensions.length === 0,
    `${imageWithoutDimensions.length} of ${images.length} lack width/height`,
    "advisory",
  );
}

record("seo", "all pages", "canonical URLs are unique", new Set(canonicalValues).size === canonicalValues.length, `${canonicalValues.length} canonicals`);

const stylesheetSources = await Promise.all(["styles.css", "internal-pages.css"].map((file) => readFile(resolve(root, file), "utf8")));
record("accessibility", "stylesheets", "visible keyboard focus styles", stylesheetSources.every((source) => /:focus(?:-visible)?/i.test(source)));
record("accessibility", "stylesheets", "reduced-motion support", stylesheetSources.every((source) => /prefers-reduced-motion/i.test(source)));

const analyticsSource = await readRequired("analytics.js", "analytics");
if (analyticsSource) {
  record("analytics", "analytics.js", "valid Measurement ID guard", /\^G-\[A-Z0-9\]\+/i.test(analyticsSource) && /measurement/i.test(analyticsSource));

  function executeAnalytics(measurementId) {
    const appended = [];
    const document = {
      currentScript: {
        dataset: { gaMeasurementId: measurementId },
        getAttribute(name) {
          return name === "data-ga-measurement-id" ? measurementId : null;
        },
      },
      createElement(tagName) {
        return { tagName, async: false, dataset: {}, setAttribute(name, value) { this[name] = value; } };
      },
      head: {
        appendChild(element) {
          appended.push(element);
          return element;
        },
        append(element) {
          appended.push(element);
          return element;
        },
      },
      addEventListener() {},
      querySelectorAll() { return []; },
    };
    const window = { document, dataLayer: [], location: { href: `${productionOrigin}/`, pathname: "/" } };
    const context = { window, document, URL, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
    vm.runInNewContext(analyticsSource, context, { filename: "analytics.js", timeout: 1000 });
    return { appended, dataLayer: window.dataLayer };
  }

  try {
    const emptyRun = executeAnalytics("");
    const invalidRun = executeAnalytics("not-a-ga-id");
    const noExternalScripts = [...emptyRun.appended, ...invalidRun.appended].every(
      (element) => !/googletagmanager|google-analytics/i.test(element.src || ""),
    );
    record("analytics", "analytics.js", "no analytics network bootstrap without valid ID", noExternalScripts, `${emptyRun.appended.length + invalidRun.appended.length} elements appended`);
  } catch (error) {
    record("analytics", "analytics.js", "no analytics network bootstrap without valid ID", false, `sandbox execution failed: ${error.message}`);
  }
}

const robotsSource = await readRequired("robots.txt", "seo");
if (robotsSource) {
  record("seo", "robots.txt", "production crawling allowed", /User-agent:\s*\*[\s\S]*Allow:\s*\//i.test(robotsSource));
  record("seo", "robots.txt", "production sitemap declared", /Sitemap:\s*https:\/\/bestevillas\.com\/sitemap\.xml/i.test(robotsSource));
}

const sitemapSource = await readRequired("sitemap.xml", "seo");
if (sitemapSource) {
  const locations = [...sitemapSource.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => match[1].trim().replace(/&amp;/g, "&"));
  record("seo", "sitemap.xml", "13 canonical route URLs", locations.length === 13, `${locations.length} found`);
  record("seo", "sitemap.xml", "only production URLs", locations.every(isProductionUrl), locations.filter((url) => !isProductionUrl(url)).join(", "));
  record("seo", "sitemap.xml", "route URLs are unique", new Set(locations).size === locations.length);
  for (const villaKey of ["prospect-three", "prospect-two", "providence", "st-silas"]) {
    record("seo", "sitemap.xml", `villa route included: ${villaKey}`, locations.some((url) => url.includes(`villa=${villaKey}`)));
  }
}

const scriptSource = await readRequired("script.js", "route");
if (scriptSource) {
  for (const villaKey of ["prospect-three", "prospect-two", "providence", "st-silas"]) {
    record("route", "script.js", `dynamic villa supported: ${villaKey}`, scriptSource.includes(villaKey));
  }
  record("route", "script.js", "dynamic SEO metadata update present", /canonical/i.test(scriptSource) && /application\/ld\+json|structured|jsonLd/i.test(scriptSource));
}

const cmsConfig = await readRequired(".pages.yml", "cms");
if (cmsConfig) {
  record("cms", ".pages.yml", "media maps to local image directory", /assets\/images/i.test(cmsConfig));
  for (const directory of ["content/villas", "content/pages", "content/guide"]) {
    record("cms", ".pages.yml", `collection configured: ${directory}`, cmsConfig.replace(/\\/g, "/").includes(directory));
  }
  record(
    "cms",
    ".pages.yml",
    "fixed content create/rename/delete restricted",
    (cmsConfig.match(/create:\s*false/gi) || []).length >= 3 &&
      (cmsConfig.match(/rename:\s*false/gi) || []).length >= 3 &&
      (cmsConfig.match(/delete:\s*false/gi) || []).length >= 3,
  );
  record("cms", ".pages.yml", "guide creation enabled", /content\/guide[\s\S]{0,1200}create:\s*true/i.test(cmsConfig));
  record("cms", ".pages.yml", "guide README excluded", /content\/guide[\s\S]{0,400}exclude:\s*\[?README\.md/i.test(cmsConfig));
}

await readRequired("docs/CMS_SETUP.md", "cms");
const siteSettings = await readRequired("content/site.yml", "cms");
if (siteSettings) {
  const settingsKeys = topLevelKeys(siteSettings);
  const missingSettings = ["site_name", "brand_location", "tagline", "production_url", "contact", "footer_summary", "primary_markets"].filter(
    (key) => !settingsKeys.has(key),
  );
  record("cms", "content/site.yml", "required site settings", missingSettings.length === 0, missingSettings.join(", "));
  record(
    "cms",
    "content/site.yml",
    "production URL matches canonical origin",
    simpleYamlValue(siteSettings, "production_url") === productionOrigin,
    simpleYamlValue(siteSettings, "production_url"),
  );
}

const contentContracts = [
  {
    directory: "content/villas",
    minimum: 4,
    bodyRequired: true,
    required: ["title", "slug", "status", "sort_order", "location", "bedrooms", "bathrooms", "summary", "booking_url", "hero_image", "hero_image_alt", "gallery", "amenities", "seo"],
  },
  {
    directory: "content/pages",
    minimum: 9,
    bodyRequired: false,
    required: ["title", "slug", "nav_label", "template", "status", "hero_heading", "hero_intro", "hero_image", "hero_image_alt", "seo"],
  },
  {
    directory: "content/guide",
    minimum: 0,
    bodyRequired: true,
    required: ["title", "slug", "status", "published_at", "author", "excerpt", "hero_image", "hero_image_alt", "categories", "seo"],
  },
];

for (const contract of contentContracts) {
  const files = await markdownFiles(contract.directory);
  record("cms", contract.directory, "content entries present", files.length >= contract.minimum, `${files.length} found; expected at least ${contract.minimum}`);
  for (const file of files) {
    const source = await readFile(resolve(root, file), "utf8");
    const parsed = frontmatter(source);
    record("cms", file, "valid frontmatter envelope", Boolean(parsed));
    if (!parsed) continue;
    const keys = topLevelKeys(parsed.yaml);
    const missing = contract.required.filter((key) => !keys.has(key));
    record("cms", file, "required content fields", missing.length === 0, missing.join(", "));
    if (contract.bodyRequired) record("cms", file, "non-empty editor body", Boolean(parsed.body));
    const seo = yamlSection(parsed.yaml, "seo");
    record("cms", file, "SEO title and description", /(?:^|\n)\s+meta_title:\s*\S/m.test(seo) && /(?:^|\n)\s+meta_description:\s*\S/m.test(seo));
    if (contract.directory === "content/villas") {
      record("cms", file, "external booking URL", /^https:\/\/direct-book\.com\//i.test(simpleYamlValue(parsed.yaml, "booking_url")));
      const gallery = yamlSection(parsed.yaml, "gallery");
      record("cms", file, "gallery image and alt fields", /(?:^|\n)\s+-?\s*image:\s*\S/m.test(gallery) && /(?:^|\n)\s+alt:\s*\S/m.test(gallery));
    }
  }
}

const requiredFailures = results.filter((result) => result.severity === "required" && !result.passed);
const advisories = results.filter((result) => result.severity === "advisory" && !result.passed);
const report = {
  passed: results.filter((result) => result.passed).length,
  total: results.length,
  requiredFailures,
  advisories,
  results,
};

await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      total: report.total,
      requiredFailures: requiredFailures.length,
      advisories: advisories.length,
      failed: [...requiredFailures, ...advisories].map(({ area, target, check, detail, severity }) => ({ area, target, check, detail, severity })),
    },
    null,
    2,
  ),
);

if (requiredFailures.length) process.exitCode = 1;
