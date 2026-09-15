import { execFile } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const execFileAsync = promisify(execFile);
const root = resolve(".");
const buildScript = resolve(root, "scripts", "build.mjs");
const distDir = resolve(root, process.env.CMS_AUDIT_DIST || "dist");
const evidencePath = resolve(root, "testing", "evidence", "cms-build-audit.json");
const productionOrigin = "https://bestevillas.com";
const baseRoutes = [
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
const pageOutputs = {
  home: "index.html",
  villas: "villas.html",
  locations: "locations.html",
  about: "about.html",
  reviews: "reviews.html",
  guide: "guide.html",
  faq: "faq.html",
  policies: "policies.html",
  contact: "contact.html",
};
const expectedVillaSlugs = ["prospect-three", "prospect-two", "providence", "st-silas"];
const unsafeMarkers = ["data-cms-text", "data-cms-alt-breakout", "data-cms-villa", "data-cms-guide", "data-cms-body"];
const results = [];
let temporaryRoot = null;

function record(suite, target, check, passed, detail = "") {
  results.push({ suite, target, check, passed: Boolean(passed), detail: String(detail || "") });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~`]/g, "");
}

function visibleText(html) {
  return normalizeText(
    decodeHtml(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodedSource(html) {
  return normalizeText(decodeHtml(html));
}

function valueAppears(html, value, { markdown = false, visible = true } = {}) {
  if (value === undefined || value === null || value === "") return true;
  const expected = normalizeText(markdown ? stripMarkdown(value) : value);
  if (!expected) return true;
  const corpus = visible ? visibleText(html) : decodedSource(html);
  return corpus.includes(expected);
}

function parseFrontmatter(source, file) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Invalid frontmatter envelope: ${file}`);
  const data = parseYaml(match[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Invalid frontmatter mapping: ${file}`);
  return { data, body: match[2].trim() };
}

async function markdownEntries(directory) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md" && entry.name.toLowerCase() !== "readme.md")
    .map((entry) => resolve(directory, entry.name))
    .sort();
}

async function loadModels(contentDirectory) {
  const site = parseYaml(await readFile(resolve(contentDirectory, "site.yml"), "utf8"));
  const loadCollection = async (name) => {
    const files = await markdownEntries(resolve(contentDirectory, name));
    return Promise.all(
      files.map(async (file) => {
        const parsed = parseFrontmatter(await readFile(file, "utf8"), file);
        return { ...parsed, file, relativeFile: relative(contentDirectory, file).replaceAll("\\", "/") };
      }),
    );
  };
  return {
    site,
    pages: await loadCollection("pages"),
    villas: await loadCollection("villas"),
    guidePosts: await loadCollection("guide"),
  };
}

async function htmlFiles(outputDirectory) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".html") found.push(absolute);
    }
  }
  await walk(outputDirectory);
  return found.sort();
}

function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2].trim()) : null;
}

function metadata(html) {
  const titleMatches = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const metaTags = tags(html, "meta");
  const linkTags = tags(html, "link");
  const findMeta = (kind, value) => metaTags.filter((tag) => attribute(tag, kind)?.toLowerCase() === value.toLowerCase());
  const canonicalTags = linkTags.filter((tag) => attribute(tag, "rel")?.toLowerCase().split(/\s+/).includes("canonical"));
  return {
    titles: titleMatches.map((match) => normalizeText(decodeHtml(match[1]))),
    descriptions: findMeta("name", "description").map((tag) => attribute(tag, "content")),
    robots: findMeta("name", "robots").map((tag) => attribute(tag, "content")),
    canonical: canonicalTags.map((tag) => attribute(tag, "href")),
    ogUrl: findMeta("property", "og:url").map((tag) => attribute(tag, "content")),
    twitterTitle: findMeta("name", "twitter:title").map((tag) => attribute(tag, "content")),
  };
}

function parseSchemas(html) {
  const parsed = [];
  const failures = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      parsed.push(JSON.parse(match[1].trim()));
    } catch (error) {
      failures.push(error.message);
    }
  }
  return { parsed, failures };
}

function collectObjectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectObjectKeys(entry, keys));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      collectObjectKeys(entry, keys);
    }
  }
  return keys;
}

function normalizeBasePath(value = "/") {
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading === "/" ? "/" : `${withLeading.replace(/\/+$/, "")}/`;
}

function outputPathForLocalReference(outputDirectory, pageFile, reference, basePath) {
  let pathValue = reference.split(/[?#]/)[0];
  if (!pathValue) return pageFile;
  try {
    pathValue = decodeURIComponent(pathValue);
  } catch {
    return null;
  }
  if (pathValue.startsWith("/")) {
    const normalizedBase = normalizeBasePath(basePath);
    if (normalizedBase !== "/" && pathValue.startsWith(normalizedBase)) pathValue = pathValue.slice(normalizedBase.length);
    else pathValue = pathValue.replace(/^\/+/, "");
    return resolve(outputDirectory, pathValue || "index.html");
  }
  return resolve(dirname(pageFile), pathValue);
}

async function validateLocalReferences(outputDirectory, basePath, label) {
  const files = await htmlFiles(outputDirectory);
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const relativePage = relative(outputDirectory, file).replaceAll("\\", "/");
    const references = [];
    for (const match of html.matchAll(/\b(?:href|src|action)\s*=\s*(["'])(.*?)\1/gi)) references.push(match[2]);
    for (const match of html.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
      for (const candidate of match[2].split(",")) references.push(candidate.trim().split(/\s+/)[0]);
    }
    for (const reference of references) {
      if (!reference || /^(?:https?:|mailto:|tel:|data:|blob:|#)/i.test(reference)) continue;
      if (/^javascript:/i.test(reference)) {
        record("local-refs", `${label}/${relativePage}`, reference, false, "javascript URL is not allowed");
        continue;
      }
      const normalizedBase = normalizeBasePath(basePath);
      if (normalizedBase !== "/" && reference.startsWith("/") && !reference.startsWith("//")) {
        record("base-path", `${label}/${relativePage}`, reference, reference.startsWith(normalizedBase), `expected prefix ${normalizedBase}`);
      }
      const target = outputPathForLocalReference(outputDirectory, file, reference, basePath);
      const insideOutput = Boolean(target && (target === outputDirectory || target.startsWith(`${outputDirectory}${sep}`)));
      let targetExists = insideOutput && (await exists(target));
      if (targetExists) {
        const statTarget = target.endsWith(sep) ? resolve(target, "index.html") : target;
        targetExists = await exists(statTarget);
      }
      record("local-refs", `${label}/${relativePage}`, reference, insideOutput && targetExists, target ? relative(outputDirectory, target) : "invalid URL encoding");
    }
  }

  const cssFiles = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".css")
    .map((entry) => resolve(outputDirectory, entry.name));
  for (const file of cssFiles) {
    const css = await readFile(file, "utf8");
    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
      const reference = match[2];
      if (!reference || /^(?:https?:|data:|blob:|#)/i.test(reference)) continue;
      const target = outputPathForLocalReference(outputDirectory, file, reference, basePath);
      record("local-refs", `${label}/${relative(outputDirectory, file)}`, reference, Boolean(target && (await exists(target))), target || "invalid");
    }
  }
}

function routeExpectations(models) {
  const expected = new Map();
  for (const page of models.pages.filter((entry) => entry.data.status === "published")) {
    const output = pageOutputs[page.data.slug];
    if (output) expected.set(output, { kind: "page", entry: page, noindex: Boolean(page.data.seo?.noindex) });
  }
  for (const villa of models.villas.filter((entry) => entry.data.status === "published")) {
    expected.set(`villas/${villa.data.slug}.html`, { kind: "villa", entry: villa, noindex: Boolean(villa.data.seo?.noindex) });
  }
  for (const post of models.guidePosts.filter((entry) => entry.data.status === "published")) {
    expected.set(`guide/${post.data.slug}.html`, { kind: "guide", entry: post, noindex: Boolean(post.data.seo?.noindex) });
  }
  return expected;
}

function expectedCanonical(outputPath, expectation) {
  if (expectation?.kind === "villa") return `${productionOrigin}/villas/${expectation.entry.data.slug}.html`;
  if (expectation?.kind === "guide") return `${productionOrigin}/guide/${expectation.entry.data.slug}.html`;
  const configured = expectation?.entry?.data?.seo?.canonical_path;
  if (configured) return new URL(configured, `${productionOrigin}/`).href;
  return new URL(outputPath === "index.html" ? "/" : `/${outputPath}`, `${productionOrigin}/`).href;
}

async function readManifest(outputDirectory, label) {
  const file = resolve(outputDirectory, "content-manifest.json");
  const present = await exists(file);
  record("manifest", label, "content-manifest.json exists", present);
  if (!present) return null;
  try {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    record("manifest", label, "manifest schema and routes", Boolean(manifest.build && Array.isArray(manifest.routes)), JSON.stringify({ schemaVersion: manifest.schemaVersion, routes: manifest.routes?.length }));
    return manifest;
  } catch (error) {
    record("manifest", label, "manifest parses", false, error.message);
    return null;
  }
}

async function auditRoutes(outputDirectory, models, label, manifest) {
  for (const route of baseRoutes) record("routes", label, `base route: ${route}`, await exists(resolve(outputDirectory, route)));
  const guideIndex = (await exists(resolve(outputDirectory, "guide.html"))) ? await readFile(resolve(outputDirectory, "guide.html"), "utf8") : "";

  const publishedVillas = models.villas.filter((entry) => entry.data.status === "published");
  record("routes", label, "four published villa records", publishedVillas.length === 4, `${publishedVillas.length} found`);
  for (const slug of expectedVillaSlugs) {
    const inCms = publishedVillas.some((entry) => entry.data.slug === slug);
    const generated = await exists(resolve(outputDirectory, "villas", `${slug}.html`));
    record("routes", label, `pretty villa route: ${slug}`, inCms && generated, `cms=${inCms}, file=${generated}`);
  }

  const publishedPosts = models.guidePosts.filter((entry) => entry.data.status === "published");
  for (const post of publishedPosts) {
    record("routes", label, `guide route: ${post.data.slug}`, await exists(resolve(outputDirectory, "guide", `${post.data.slug}.html`)));
  }
  record("routes", label, "all published guide posts generated", publishedPosts.length === (await Promise.all(publishedPosts.map((post) => exists(resolve(outputDirectory, "guide", `${post.data.slug}.html`))))).filter(Boolean).length, `${publishedPosts.length} published`);

  for (const draft of models.guidePosts.filter((entry) => entry.data.status !== "published")) {
    const leakedFile = await exists(resolve(outputDirectory, "guide", `${draft.data.slug}.html`));
    const leakedManifest = manifest?.routes?.some((route) => route.slug === draft.data.slug || route.outputPath === `guide/${draft.data.slug}.html`);
    const leakedListing = guideIndex.includes(draft.data.slug) || guideIndex.includes(draft.data.title);
    record("routes", label, `draft excluded: ${draft.data.slug}`, !leakedFile && !leakedManifest && !leakedListing, `file=${leakedFile}, manifest=${Boolean(leakedManifest)}, listing=${leakedListing}`);
  }

  if (manifest) {
    const manifestOutputs = new Set(manifest.routes.map((route) => String(route.outputPath || route.output || "").replace(/^\/+/, "")));
    for (const route of baseRoutes) record("manifest", label, `base route recorded: ${route}`, manifestOutputs.has(route));
    for (const [path] of routeExpectations(models)) record("manifest", label, `content route recorded: ${path}`, manifestOutputs.has(path));
  }
}

async function auditContentTrace(outputDirectory, models, label) {
  const generatedHtmlFiles = await htmlFiles(outputDirectory);
  const allOutput = (await Promise.all(generatedHtmlFiles.map((file) => readFile(file, "utf8")))).join("\n");
  for (const key of ["site_name", "tagline", "footer_summary"]) {
    record("content", label, `site setting rendered: ${key}`, valueAppears(allOutput, models.site[key], { visible: key !== "site_name" }), models.site[key]);
  }
  for (const key of ["email", "phone_display"]) {
    record("content", label, `contact setting rendered: ${key}`, valueAppears(allOutput, models.site.contact?.[key], { visible: false }), models.site.contact?.[key]);
  }
  for (const key of ["street", "locality", "country_code"]) {
    const value = models.site.address?.[key];
    if (value) record("content", label, `address setting rendered: ${key}`, valueAppears(allOutput, value, { visible: false }), value);
  }
  const allSchemas = [];
  for (const file of generatedHtmlFiles) allSchemas.push(...parseSchemas(await readFile(file, "utf8")).parsed);
  const schemaCorpus = JSON.stringify(allSchemas);
  for (const key of ["street", "locality", "country_code"]) {
    const value = models.site.address?.[key];
    if (value) record("schema", label, `address setting reaches JSON-LD: ${key}`, schemaCorpus.includes(String(value)), value);
  }

  for (const page of models.pages.filter((entry) => entry.data.status === "published")) {
    const output = pageOutputs[page.data.slug];
    if (!output || !(await exists(resolve(outputDirectory, output)))) continue;
    const html = await readFile(resolve(outputDirectory, output), "utf8");
    for (const key of ["nav_label", "hero_heading", "hero_intro", "hero_image_alt"]) {
      record("content", `${label}/${output}`, `CMS field rendered: ${key}`, valueAppears(html, page.data[key], { visible: key !== "hero_image_alt" }), page.data[key]);
    }
    if (page.body) record("content", `${label}/${output}`, "CMS body rendered", valueAppears(html, page.body, { markdown: true }), normalizeText(page.body).slice(0, 120));
    for (const key of ["heading", "text", "label"]) {
      const value = page.data.call_to_action?.[key];
      if (value) record("content", `${label}/${output}`, `CMS CTA rendered: ${key}`, valueAppears(html, value), value);
    }
    for (const [index, section] of (page.data.sections || []).entries()) {
      record("content", `${label}/${output}`, `section ${index + 1} heading rendered`, valueAppears(html, section.heading), section.heading);
      record("content", `${label}/${output}`, `section ${index + 1} text rendered`, valueAppears(html, section.text, { markdown: true }), normalizeText(section.text).slice(0, 100));
    }
    const meta = metadata(html);
    record("metadata", `${label}/${output}`, "CMS SEO title rendered", meta.titles.length === 1 && meta.titles[0] === page.data.seo?.meta_title, JSON.stringify(meta.titles));
    record("metadata", `${label}/${output}`, "CMS SEO description rendered", meta.descriptions.length === 1 && meta.descriptions[0] === page.data.seo?.meta_description, JSON.stringify(meta.descriptions));
  }

  for (const villa of models.villas.filter((entry) => entry.data.status === "published")) {
    const output = `villas/${villa.data.slug}.html`;
    if (!(await exists(resolve(outputDirectory, output)))) continue;
    const html = await readFile(resolve(outputDirectory, output), "utf8");
    for (const key of ["title", "summary", "hero_image_alt"]) {
      record("content", `${label}/${output}`, `CMS field rendered: ${key}`, valueAppears(html, villa.data[key], { visible: key !== "hero_image_alt" }), villa.data[key]);
    }
    if (villa.body) record("content", `${label}/${output}`, "CMS body rendered", valueAppears(html, villa.body, { markdown: true }), normalizeText(villa.body).slice(0, 120));
    for (const amenity of villa.data.amenities || []) record("content", `${label}/${output}`, `amenity rendered: ${amenity}`, valueAppears(html, amenity), amenity);
    for (const item of villa.data.gallery || []) record("content", `${label}/${output}`, `gallery alt rendered: ${item.alt}`, valueAppears(html, item.alt, { visible: false }), item.alt);
    const meta = metadata(html);
    record("metadata", `${label}/${output}`, "CMS villa SEO title rendered", meta.titles.length === 1 && meta.titles[0] === villa.data.seo?.meta_title, JSON.stringify(meta.titles));
    record("metadata", `${label}/${output}`, "CMS villa SEO description rendered", meta.descriptions.length === 1 && meta.descriptions[0] === villa.data.seo?.meta_description, JSON.stringify(meta.descriptions));
  }

  for (const post of models.guidePosts.filter((entry) => entry.data.status === "published")) {
    const output = `guide/${post.data.slug}.html`;
    if (!(await exists(resolve(outputDirectory, output)))) continue;
    const html = await readFile(resolve(outputDirectory, output), "utf8");
    for (const key of ["title", "author", "excerpt", "hero_image_alt"]) {
      record("content", `${label}/${output}`, `CMS guide field rendered: ${key}`, valueAppears(html, post.data[key], { visible: key !== "hero_image_alt" }), post.data[key]);
    }
    record("content", `${label}/${output}`, "CMS guide body rendered", valueAppears(html, post.body, { markdown: true }), normalizeText(post.body).slice(0, 120));
  }
}

async function auditMetadataAndIndexing(outputDirectory, models, label, mode) {
  const expectations = routeExpectations(models);
  const canonicalByOutput = new Map();
  for (const [output, expectation] of expectations) canonicalByOutput.set(output, expectedCanonical(output, expectation));
  const defaultVilla = models.villas.filter((entry) => entry.data.status === "published").sort((a, b) => (a.data.sort_order || 0) - (b.data.sort_order || 0))[0];
  if (defaultVilla) canonicalByOutput.set("villa.html", `${productionOrigin}/villas/${defaultVilla.data.slug}.html`);

  for (const file of await htmlFiles(outputDirectory)) {
    const output = relative(outputDirectory, file).replaceAll("\\", "/");
    const html = await readFile(file, "utf8");
    const meta = metadata(html);
    const expected = expectations.get(output);
    const canonical = canonicalByOutput.get(output);
    record("metadata", `${label}/${output}`, "one non-empty title", meta.titles.length === 1 && Boolean(meta.titles[0]), JSON.stringify(meta.titles));
    record("metadata", `${label}/${output}`, "one non-empty description", meta.descriptions.length === 1 && Boolean(meta.descriptions[0]), JSON.stringify(meta.descriptions));
    record("metadata", `${label}/${output}`, "canonical is exact pretty production URL", meta.canonical.length === 1 && meta.canonical[0] === canonical, `expected ${canonical}; found ${meta.canonical.join(", ")}`);
    record("metadata", `${label}/${output}`, "Open Graph URL matches canonical", meta.ogUrl.length === 1 && meta.ogUrl[0] === canonical, JSON.stringify(meta.ogUrl));

    const schema = parseSchemas(html);
    record("schema", `${label}/${output}`, "JSON-LD exists and parses", schema.parsed.length > 0 && schema.failures.length === 0, schema.failures.join("; "));
    record("schema", `${label}/${output}`, "JSON-LD identifies canonical route", Boolean(canonical && JSON.stringify(schema.parsed).includes(canonical)), canonical);

    const robots = meta.robots.join(", ").toLowerCase();
    const shouldNoindex = mode === "preview" || output === "villa.html" || Boolean(expected?.noindex);
    record("indexing", `${label}/${output}`, shouldNoindex ? "noindex required" : "indexing allowed", shouldNoindex ? robots.includes("noindex") : !robots.includes("noindex"), robots || "no robots meta");
    if (output === "villa.html") {
      record("indexing", `${label}/${output}`, "legacy route is not a canonical target", !meta.canonical[0]?.includes("/villa.html") && !meta.canonical[0]?.includes("?villa="), meta.canonical[0]);
    }
  }

  const robotsFile = await readFile(resolve(outputDirectory, "robots.txt"), "utf8");
  record("indexing", label, mode === "preview" ? "preview robots block crawling" : "production robots allow crawling", mode === "preview" ? /Disallow:\s*\//i.test(robotsFile) : /Allow:\s*\//i.test(robotsFile), normalizeText(robotsFile));
}

async function auditSitemap(outputDirectory, models, label) {
  const sitemap = await readFile(resolve(outputDirectory, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtml(match[1].trim()));
  const expected = new Set();
  for (const [output, expectation] of routeExpectations(models)) {
    if (!expectation.noindex) expected.add(expectedCanonical(output, expectation));
  }
  record("sitemap", label, "legacy villa route excluded", !locations.some((url) => url.includes("/villa.html") || url.includes("?villa=")), JSON.stringify(locations.filter((url) => url.includes("villa"))));
  record("sitemap", label, "only unique production URLs", locations.every((url) => url.startsWith(`${productionOrigin}/`)) && new Set(locations).size === locations.length, `${locations.length} URLs`);
  record("sitemap", label, "all indexable generated routes included exactly", locations.length === expected.size && locations.every((url) => expected.has(url)), JSON.stringify({ expected: [...expected], found: locations }));
}

async function auditBookingAndClaims(outputDirectory, models, label) {
  const villas = models.villas.filter((entry) => entry.data.status === "published");
  const listingHtml = await readFile(resolve(outputDirectory, "villas.html"), "utf8");
  for (const villa of villas) {
    const booking = new URL(villa.data.booking_url);
    const validConfiguredUrl = booking.protocol === "https:" && booking.hostname === "direct-book.com" && booking.pathname.startsWith("/properties/") && !booking.search && !booking.hash && !booking.username && !booking.password;
    record("booking", villa.data.slug, "CMS booking URL is stable Direct-book base", validConfiguredUrl, villa.data.booking_url);
    const output = `villas/${villa.data.slug}.html`;
    const html = await readFile(resolve(outputDirectory, output), "utf8");
    const outbound = [...html.matchAll(/\b(?:href|action)\s*=\s*(["'])(https:\/\/direct-book\.com\/[^"']+)\1/gi)].map((match) => decodeHtml(match[2]));
    record("booking", `${label}/${output}`, "exact booking URL rendered", outbound.includes(villa.data.booking_url), JSON.stringify(outbound));
    record("booking", `${label}/villas.html`, `listing URL rendered: ${villa.data.slug}`, listingHtml.includes(villa.data.booking_url), villa.data.booking_url);
    record("booking", `${label}/${output}`, "no stale dates or booking query parameters", outbound.every((url) => !/[?#]|(?:2024|checkin|checkout|arrival|departure)/i.test(url)), JSON.stringify(outbound));

    const schemas = parseSchemas(html).parsed;
    const schemaKeys = collectObjectKeys(schemas).map((key) => key.toLowerCase());
    if (villa.data.max_guests === undefined || villa.data.max_guests === null || villa.data.max_guests === "") {
      const visible = visibleText(html);
      const hasCapacityClaim = /\b(?:sleeps?|accommodates|max(?:imum)?\s+guests?)\s*:?[\s-]*\d+/i.test(visible) || /\b\d+\s+guests?\b/i.test(visible);
      record("claims", `${label}/${output}`, "unconfirmed occupancy omitted", !hasCapacityClaim && !schemaKeys.includes("occupancy") && !html.includes("max_guests"), JSON.stringify({ hasCapacityClaim, occupancySchema: schemaKeys.includes("occupancy") }));
    }
    const hasStaticPrice = /(?:[$£€]\s*\d|\b(?:USD|CAD|GBP)\s*\d|\bfrom\s+[$£€]?\s*\d+\s*(?:per|\/)?\s*night)/i.test(visibleText(html));
    const priceSchema = schemaKeys.some((key) => ["price", "pricerange", "lowprice", "highprice", "offers"].includes(key));
    record("claims", `${label}/${output}`, "no unconfirmed static prices", !hasStaticPrice && !priceSchema, JSON.stringify({ hasStaticPrice, priceSchema }));
  }
}

async function auditSafeFixture(outputDirectory, label) {
  const files = await htmlFiles(outputDirectory);
  const combinedHtml = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const marker of unsafeMarkers) {
    const activeMatch = combinedHtml.match(new RegExp(`<(?:script|img|tag)\\b[^>]*${marker}`, "i"));
    record("escaping", label, `fixture value rendered: ${marker}`, combinedHtml.includes(marker));
    record("escaping", label, `no active injected element: ${marker}`, !activeMatch, activeMatch?.[0]?.slice(0, 500) || "");
  }
  const breakoutMatch = combinedHtml.match(/<img\b[^>]*\sdata-cms-alt-breakout\s*=|<img\b[^>]*\sonerror\s*=/i);
  record("escaping", label, "attribute breakout blocked", !breakoutMatch, breakoutMatch?.[0]?.slice(0, 500) || "");
  record("escaping", label, "CMS payload cannot terminate JSON-LD script", !/<script\b[^>]*data-cms-(?:villa|guide|text|body)/i.test(combinedHtml));

  const siteContentPath = resolve(outputDirectory, "site-content.js");
  const siteContent = await readFile(siteContentPath, "utf8");
  record("escaping", `${label}/site-content.js`, "generated JS contains CMS mutation", unsafeMarkers.some((marker) => siteContent.includes(marker)));
  record("escaping", `${label}/site-content.js`, "generated JS contains no executable injected tag", !/<script\b[^>]*data-cms-|<img\b[^>]*data-cms-/i.test(siteContent));
  try {
    new Function(siteContent);
    record("escaping", `${label}/site-content.js`, "generated JS parses", true);
  } catch (error) {
    record("escaping", `${label}/site-content.js`, "generated JS parses", false, error.message);
  }
}

async function auditOutput(outputDirectory, models, label, mode, { safeFixture = false } = {}) {
  const manifest = await readManifest(outputDirectory, label);
  record("manifest", label, "build mode matches audit", manifest?.build?.mode === mode, manifest?.build?.mode || "missing");
  record("manifest", label, "production canonical origin", manifest?.build?.origin === productionOrigin, manifest?.build?.origin || "missing");
  await auditRoutes(outputDirectory, models, label, manifest);
  await auditContentTrace(outputDirectory, models, label);
  await auditMetadataAndIndexing(outputDirectory, models, label, mode);
  await auditSitemap(outputDirectory, models, label);
  await auditBookingAndClaims(outputDirectory, models, label);
  await validateLocalReferences(outputDirectory, manifest?.build?.basePath || "/", label);
  if (safeFixture) await auditSafeFixture(outputDirectory, label);
  return manifest;
}

async function runBuild(contentDirectory, outputDirectory, mode, basePath) {
  const args = [buildScript, "--content", contentDirectory, "--out", outputDirectory, "--mode", mode, "--base-path", basePath];
  return execFileAsync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

async function writeFrontmatter(file, data, body) {
  const yaml = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  await writeFile(file, `---\n${yaml}\n---\n\n${body.trim()}\n`, "utf8");
}

async function prepareFixture(contentDirectory) {
  const aboutPath = resolve(contentDirectory, "pages", "about.md");
  const about = parseFrontmatter(await readFile(aboutPath, "utf8"), aboutPath);
  about.data.hero_heading = 'QA <script data-cms-text>x</script> & "quoted"';
  about.data.hero_intro = 'QA intro proves CMS mutation & safe text <tag data-cms-text>quoted "value"</tag>.';
  about.data.hero_image_alt = 'QA image " data-cms-alt-breakout="yes" onerror="unsafe';
  about.data.seo.noindex = true;
  about.data.seo.meta_title = "QA CMS Mutation & Safe Rendering | Best E Villas";
  about.data.seo.meta_description = "QA metadata verifies that CMS-managed ampersands, quotes and safe rendering survive the production build without becoming active markup.";
  about.body = 'QA body <script data-cms-body>x</script> & "quoted" content must render as text.';
  await writeFrontmatter(aboutPath, about.data, about.body);

  const villaPath = resolve(contentDirectory, "villas", "prospect-three.md");
  const villa = parseFrontmatter(await readFile(villaPath, "utf8"), villaPath);
  villa.data.title = "QA Villa </script><script data-cms-villa>x</script>";
  villa.data.summary = 'QA villa CMS mutation & "quoted" text must appear safely in its generated route.';
  villa.data.seo.meta_title = "QA Villa CMS Mutation | Best E Villas Barbados";
  villa.data.seo.meta_description = "QA villa metadata confirms that structured content reaches the statically generated villa page safely and consistently.";
  await writeFrontmatter(villaPath, villa.data, villa.body);

  const publishedGuide = {
    title: "QA Guide </script><script data-cms-guide>x</script>",
    slug: "qa-escaping-guide",
    status: "published",
    published_at: "2026-09-11",
    author: "Best E Villas QA",
    excerpt: 'QA guide mutation & "quoted" copy proves that published CMS posts generate safe static pages.',
    hero_image: "/assets/images/barbados-life.jpg",
    hero_image_alt: 'QA guide image " data-cms-alt-breakout="yes" onerror="unsafe',
    categories: ["planning"],
    seo: {
      meta_title: "QA Guide CMS Rendering | Best E Villas",
      meta_description: "QA guide metadata verifies published-post generation, safe escaping, canonical URLs and production indexing behavior.",
      canonical_path: "/guide/qa-escaping-guide.html",
      noindex: false,
    },
  };
  await writeFrontmatter(resolve(contentDirectory, "guide", "2026-09-11-qa-escaping-guide.md"), publishedGuide, 'QA guide body <script data-cms-body>x</script> & "quoted" content.');

  const draftGuide = {
    ...publishedGuide,
    title: "QA Draft Guide Must Stay Private",
    slug: "qa-draft-guide",
    status: "draft",
    hero_image: "/assets/images/st-silas.jpg",
    seo: {
      ...publishedGuide.seo,
      meta_title: "QA Draft Guide Must Stay Private | Best E Villas",
      canonical_path: "/guide/qa-draft-guide.html",
    },
  };
  await writeFrontmatter(resolve(contentDirectory, "guide", "2026-09-11-qa-draft-guide.md"), draftGuide, "QA_DRAFT_CONTENT_MUST_NOT_RENDER.");
}

async function foreignOutputMustBeRefused(contentDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const sentinel = resolve(outputDirectory, "keep-me.txt");
  await writeFile(sentinel, "user-owned\n", "utf8");
  try {
    await runBuild(contentDirectory, outputDirectory, "preview", "/");
    record("output-safety", "foreign directory", "unrecognized output directory is refused", false, "build unexpectedly succeeded");
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
    record("output-safety", "foreign directory", "unrecognized output directory is refused", /refus|recognized|manifest/i.test(output), normalizeText(output).slice(0, 500));
  }
  record("output-safety", "foreign directory", "foreign sentinel is preserved", (await exists(sentinel)) && (await readFile(sentinel, "utf8")) === "user-owned\n");
}

async function duplicateSlugMustFail(contentDirectory, outputDirectory, preservedOutput) {
  const preservedBefore = await readFile(resolve(preservedOutput, "index.html"), "utf8");
  const source = resolve(contentDirectory, "villas", "prospect-two.md");
  const duplicate = resolve(contentDirectory, "villas", "qa-duplicate-villa.md");
  await cp(source, duplicate);
  try {
    await runBuild(contentDirectory, outputDirectory, "production", "/");
    record("validation", "duplicate slug", "build rejects duplicate content slug", false, "build unexpectedly succeeded");
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
    record("validation", "duplicate slug", "build rejects duplicate content slug", /duplicate|slug|already exists/i.test(output), normalizeText(output).slice(0, 500));
  }
  try {
    await runBuild(contentDirectory, preservedOutput, "production", "/");
    record("output-safety", "failed rebuild", "validation failure preserves last good build", false, "invalid rebuild unexpectedly succeeded");
  } catch {
    const preservedAfter = await readFile(resolve(preservedOutput, "index.html"), "utf8");
    record("output-safety", "failed rebuild", "validation failure preserves last good build", preservedAfter === preservedBefore);
  }
}

async function galleryLimitMustFail(contentDirectory, outputDirectory) {
  const source = resolve(contentDirectory, "villas", "prospect-two.md");
  const original = await readFile(source, "utf8");
  const parsed = parseFrontmatter(original, source);
  parsed.data.gallery = Array.from({ length: 21 }, (_, index) => ({
    image: parsed.data.gallery[0].image,
    alt: `QA gallery image ${index + 1} must remain within the CMS limit`,
  }));
  await writeFrontmatter(source, parsed.data, parsed.body);
  try {
    await runBuild(contentDirectory, outputDirectory, "preview", "/");
    record("validation", "gallery limit", "build rejects more than 20 villa gallery images", false, "build unexpectedly succeeded");
  } catch (error) {
    const output = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
    record("validation", "gallery limit", "build rejects more than 20 villa gallery images", /20|gallery images|allowed/i.test(output), normalizeText(output).slice(0, 500));
  } finally {
    await writeFile(source, original, "utf8");
  }
}

await mkdir(dirname(evidencePath), { recursive: true });

try {
  const buildPresent = await exists(buildScript);
  const distPresent = await exists(distDir);
  record("precondition", "scripts/build.mjs", "renderer exists", buildPresent);
  record("precondition", relative(root, distDir).replaceAll("\\", "/"), "dist build exists", distPresent);
  const packageData = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const packageLockData = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  record("release-contract", "package.json", "production script builds at domain root", /--mode\s+production\b/.test(packageData.scripts?.["build:production"] || "") && /--base-path\s+\//.test(packageData.scripts?.["build:production"] || ""), packageData.scripts?.["build:production"] || "missing");
  record("release-contract", "package.json", "Sharp image processor is exactly pinned and locked", packageData.devDependencies?.sharp === "0.35.4" && packageLockData.packages?.[""]?.devDependencies?.sharp === "0.35.4", `package=${packageData.devDependencies?.sharp || "missing"}, lock=${packageLockData.packages?.[""]?.devDependencies?.sharp || "missing"}`);
  const workflow = await readFile(resolve(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
  const workflowConfig = parseYaml(workflow);
  const workflowTriggers = workflowConfig?.on || {};
  const workflowRunTrigger = workflowTriggers.workflow_run || {};
  const buildJob = workflowConfig?.jobs?.build || {};
  const checkoutStep = buildJob.steps?.find((step) => step?.uses === "actions/checkout@v7");
  record("release-contract", "deploy-pages.yml", "CMS audit runs before artifact upload", workflow.indexOf("npm run test:cms") > workflow.indexOf("Build preview site") && workflow.indexOf("npm run test:cms") < workflow.indexOf("actions/upload-pages-artifact"));
  record("release-contract", "deploy-pages.yml", "UI regression audit runs before artifact upload", workflow.indexOf("npm run test:ui") > workflow.indexOf("npm run test:cms") && workflow.indexOf("npm run test:ui") < workflow.indexOf("actions/upload-pages-artifact"));
  record(
    "release-contract",
    "deploy-pages.yml",
    "push and manual generated-site deployments remain enabled",
    Array.isArray(workflowTriggers.push?.branches)
      && workflowTriggers.push.branches.includes("main")
      && Object.hasOwn(workflowTriggers, "workflow_dispatch"),
  );
  record(
    "release-contract",
    "deploy-pages.yml",
    "generated Pages deployment follows the automatic Pages workflow without self-recursion",
    workflowConfig?.name === "Deploy preview to GitHub Pages"
      && Array.isArray(workflowRunTrigger.workflows)
      && workflowRunTrigger.workflows.length === 1
      && workflowRunTrigger.workflows[0] === "pages build and deployment"
      && Array.isArray(workflowRunTrigger.types)
      && workflowRunTrigger.types.includes("completed")
      && Array.isArray(workflowRunTrigger.branches)
      && workflowRunTrigger.branches.includes("main"),
  );
  record(
    "release-contract",
    "deploy-pages.yml",
    "failed automatic Pages runs cannot start a generated deployment",
    /github\.event_name\s*!=\s*['"]workflow_run['"]/.test(String(buildJob.if || ""))
      && /github\.event\.workflow_run\.conclusion\s*==\s*['"]success['"]/.test(String(buildJob.if || "")),
    String(buildJob.if || "missing"),
  );
  record(
    "release-contract",
    "deploy-pages.yml",
    "workflow-run deployments check out the exact triggering commit",
    /github\.event\.workflow_run\.head_sha/.test(String(checkoutStep?.with?.ref || ""))
      && /github\.sha/.test(String(checkoutStep?.with?.ref || "")),
    String(checkoutStep?.with?.ref || "missing"),
  );

  if (distPresent) {
    const currentModels = await loadModels(resolve(root, "content"));
    const currentManifest = JSON.parse(await readFile(resolve(distDir, "content-manifest.json"), "utf8"));
    await auditOutput(distDir, currentModels, "dist", currentManifest.build?.mode || "preview");
  }

  if (buildPresent) {
    temporaryRoot = await mkdtemp(join(tmpdir(), "bestevillas-cms-render-audit-"));
    const fixtureContent = resolve(temporaryRoot, "content");
    const previewOutput = resolve(temporaryRoot, "preview");
    const productionOutput = resolve(temporaryRoot, "production");
    const duplicateOutput = resolve(temporaryRoot, "duplicate");
    const galleryLimitOutput = resolve(temporaryRoot, "gallery-limit");
    await cp(resolve(root, "content"), fixtureContent, { recursive: true });
    await prepareFixture(fixtureContent);
    const fixtureModels = await loadModels(fixtureContent);

    try {
      await runBuild(fixtureContent, previewOutput, "preview", "/qa-preview/");
      record("build", "isolated preview", "fixture build succeeds", true);
      await auditOutput(previewOutput, fixtureModels, "isolated-preview", "preview", { safeFixture: true });
    } catch (error) {
      record("build", "isolated preview", "fixture build succeeds", false, normalizeText(`${error.stdout || ""} ${error.stderr || ""} ${error.message || ""}`).slice(0, 1000));
    }

    try {
      await runBuild(fixtureContent, productionOutput, "production", "/");
      record("build", "isolated production", "fixture build succeeds", true);
      await auditOutput(productionOutput, fixtureModels, "isolated-production", "production", { safeFixture: true });
    } catch (error) {
      record("build", "isolated production", "fixture build succeeds", false, normalizeText(`${error.stdout || ""} ${error.stderr || ""} ${error.message || ""}`).slice(0, 1000));
    }

    await foreignOutputMustBeRefused(fixtureContent, resolve(temporaryRoot, "foreign-output"));
    await galleryLimitMustFail(fixtureContent, galleryLimitOutput);
    await duplicateSlugMustFail(fixtureContent, duplicateOutput, productionOutput);
  }
} catch (error) {
  record("runtime", "cms-render-audit", "audit completes without uncaught error", false, error.stack || error.message);
} finally {
  if (temporaryRoot) {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
      record("cleanup", "temporary fixture", "temporary build removed", true);
    } catch (error) {
      record("cleanup", "temporary fixture", "temporary build removed", false, error.message);
    }
  }
}

const failed = results.filter((result) => !result.passed);
const report = {
  generatedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  total: results.length,
  failed,
  results,
};
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
