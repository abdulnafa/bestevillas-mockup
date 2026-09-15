import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseDocument } from "yaml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionOrigin = "https://bestevillas.com";
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
const sharedFiles = ["styles.css", "internal-pages.css", "script.js", "analytics.js"];
const imageMetadataCache = new Map();

function parseArguments(argv) {
  const options = {
    content: resolve(projectRoot, "content"),
    out: resolve(projectRoot, "dist"),
    mode: "preview",
    basePath: "/bestevillas-mockup/",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--content", "--out", "--mode", "--base-path"].includes(flag)) {
      throw new Error(`Unknown build option: ${flag}`);
    }
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--content") options.content = resolve(value);
    if (flag === "--out") options.out = resolve(value);
    if (flag === "--mode") options.mode = value;
    if (flag === "--base-path") options.basePath = value;
    index += 1;
  }
  if (!new Set(["preview", "production"]).has(options.mode)) {
    throw new Error(`Invalid mode "${options.mode}"; use preview or production.`);
  }
  options.basePath = normalizeBasePath(options.basePath);
  return options;
}

function normalizeBasePath(value = "/") {
  const raw = String(value || "/").replaceAll("\\", "/");
  if (raw.includes("?") || raw.includes("#") || raw.includes("..")) {
    throw new Error(`Unsafe base path: ${raw}`);
  }
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading === "/" ? "/" : `${leading.replace(/\/+$/, "")}/`;
}

function publicUrl(pathValue = "", basePath = "/") {
  const path = String(pathValue).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return `${basePath}${path}`.replace(/\/{2,}/g, "/");
}

function canonicalUrl(pathValue = "/") {
  return new URL(pathValue, `${productionOrigin}/`).href;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function safeImageAlt(value) {
  return String(value ?? "")
    .replace(/\s+(?:on[a-z]+|data-[a-z0-9_-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]*)/gi, "")
    .replace(/[<>"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imageVariantPath(imagePath, width) {
  const extension = extname(imagePath);
  return `${imagePath.slice(0, -extension.length)}-${width}${extension}`;
}

export function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return undefined;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > buffer.length) break;
    if (type === "VP8X" && length >= 10) {
      return { width: buffer.readUIntLE(dataOffset + 4, 3) + 1, height: buffer.readUIntLE(dataOffset + 7, 3) + 1 };
    }
    if (type === "VP8L" && length >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (type === "VP8 " && length >= 10 && buffer[dataOffset + 3] === 0x9d && buffer[dataOffset + 4] === 0x01 && buffer[dataOffset + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff, height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff };
    }
    offset = dataOffset + length + (length % 2);
  }
  return undefined;
}

export function readAvifDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 4, 8) !== "ftyp") return undefined;
  let offset = 0;
  let largest;
  while ((offset = buffer.indexOf("ispe", offset, "ascii")) >= 0) {
    if (offset + 16 <= buffer.length) {
      const width = buffer.readUInt32BE(offset + 8);
      const height = buffer.readUInt32BE(offset + 12);
      if (width > 0 && height > 0 && width <= 100000 && height <= 100000 && (!largest || width * height > largest.width * largest.height)) {
        largest = { width, height };
      }
    }
    offset += 4;
  }
  return largest;
}

function readImageDimensions(imagePath, imageRoot = projectRoot) {
  const normalized = String(imagePath).replace(/^\/+/, "");
  const absolute = resolve(imageRoot, normalized);
  if (imageMetadataCache.has(absolute)) return imageMetadataCache.get(absolute);
  const buffer = readFileSync(absolute);
  let dimensions;

  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (startOfFrameMarkers.has(marker)) {
        dimensions = { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
        break;
      }
      offset += segmentLength;
    }
  } else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    dimensions = readWebpDimensions(buffer);
  } else if (extname(normalized).toLowerCase() === ".avif") {
    dimensions = readAvifDimensions(buffer);
  }

  if (!dimensions?.width || !dimensions?.height) throw new Error(`Could not read image dimensions: ${imagePath}.`);
  imageMetadataCache.set(absolute, dimensions);
  return dimensions;
}

function imageSourceData(imagePath, basePath, imageRoot = projectRoot) {
  const dimensions = readImageDimensions(imagePath, imageRoot);
  const candidates = [480, 960]
    .map((width) => imageVariantPath(imagePath, width))
    .filter((candidate) => existsSync(resolve(imageRoot, candidate.replace(/^\/+/, ""))))
    .map((candidate) => ({ path: candidate, ...readImageDimensions(candidate, imageRoot) }));
  candidates.push({ path: imagePath, ...dimensions });
  candidates.sort((left, right) => left.width - right.width);
  return {
    src: publicUrl(imagePath, basePath),
    width: dimensions.width,
    height: dimensions.height,
    srcset: candidates.map((candidate) => `${publicUrl(candidate.path, basePath)} ${candidate.width}w`).join(", "),
    smallest: candidates[0],
  };
}

function imageAttributes(imagePath, basePath, { sizes = "100vw", loading = "", fetchPriority = "", placeholder = false } = {}, imageRoot = projectRoot) {
  const source = imageSourceData(imagePath, basePath, imageRoot);
  const src = placeholder ? publicUrl(source.smallest.path, basePath) : source.src;
  const attributes = [
    `src="${escapeAttribute(src)}"`,
    `width="${source.width}"`,
    `height="${source.height}"`,
    `decoding="async"`,
  ];
  if (placeholder) {
    attributes.push(`data-responsive-src="${escapeAttribute(source.src)}"`);
    attributes.push(`data-responsive-srcset="${escapeAttribute(source.srcset)}"`);
  } else {
    attributes.push(`srcset="${escapeAttribute(source.srcset)}"`);
  }
  attributes.push(`sizes="${escapeAttribute(sizes)}"`);
  if (loading) attributes.push(`loading="${loading}"`);
  if (fetchPriority) attributes.push(`fetchpriority="${fetchPriority}"`);
  return attributes.join(" ");
}

function imagePreload(imagePath, basePath, sizes, imageRoot = projectRoot) {
  const source = imageSourceData(imagePath, basePath, imageRoot);
  return `<link rel="preload" href="${escapeAttribute(source.src)}" as="image" imagesrcset="${escapeAttribute(source.srcset)}" imagesizes="${escapeAttribute(sizes)}" fetchpriority="high" />`;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const decoded = href.replaceAll("&amp;", "&");
    if (!/^(?:https:\/\/|\/)[^\s<>]*$/i.test(decoded)) return `${label} (${escapeHtml(decoded)})`;
    const external = decoded.startsWith("https://") ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${escapeAttribute(decoded)}"${external}>${label}</a>`;
  });
  return text;
}

function renderMarkdown(value) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const blocks = normalized.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = lines[0].match(/^(#{1,6})\s+(.+)$/);
      if (heading && lines.length === 1) {
        const level = Math.min(6, Math.max(2, heading[1].length));
        return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      }
      if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*[-*+]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
        return `<ol>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${lines.map((line) => inlineMarkdown(line)).join("<br />")}</p>`;
    })
    .join("\n");
}

function parseYaml(source, file) {
  const document = parseDocument(source.replace(/^\uFEFF/, ""), {
    prettyErrors: true,
    uniqueKeys: true,
  });
  if (document.errors.length) {
    throw new Error(`Invalid YAML in ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const value = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a YAML mapping in ${file}.`);
  }
  return value;
}

function parseFrontmatter(source, file) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Invalid frontmatter envelope in ${file}.`);
  return { data: parseYaml(match[1], file), body: match[2].trim() };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function markdownRecords(directory, contentRoot) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md" && entry.name.toLowerCase() !== "readme.md")
    .map((entry) => resolve(directory, entry.name))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const parsed = parseFrontmatter(await readFile(file, "utf8"), file);
      return {
        ...parsed,
        source: relative(contentRoot, file).replaceAll("\\", "/"),
      };
    }),
  );
}

async function loadContent(contentRoot) {
  const siteFile = resolve(contentRoot, "site.yml");
  const site = parseYaml(await readFile(siteFile, "utf8"), siteFile);
  return {
    site,
    pages: await markdownRecords(resolve(contentRoot, "pages"), contentRoot),
    villas: await markdownRecords(resolve(contentRoot, "villas"), contentRoot),
    guidePosts: await markdownRecords(resolve(contentRoot, "guide"), contentRoot),
  };
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required text: ${label}.`);
}

function validateSlug(value, label) {
  assertString(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`Invalid slug "${value}" in ${label}.`);
}

function validateImage(value, label) {
  assertString(value, label);
  if (!/^\/assets\/images\/[A-Za-z0-9_./-]+$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new Error(`Unsafe image path "${value}" in ${label}.`);
  }
}

function validateStatus(value, label) {
  if (!["published", "draft"].includes(value)) throw new Error(`Invalid status "${value}" in ${label}.`);
}

function validateNumber(value, label, { min, max, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid numeric value for ${label}; expected ${min} to ${max}.`);
  }
}

function validateNavigationUrl(value, label, { externalOnly = false } = {}) {
  assertString(value, label);
  const url = String(value).trim();
  if (/^(?:javascript|data|blob|file):/i.test(url) || url.includes("\\")) throw new Error(`Unsafe URL in ${label}.`);
  if (url.startsWith("/")) {
    if (externalOnly || url.startsWith("//") || url.includes("..")) throw new Error(`Invalid internal URL in ${label}.`);
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL in ${label}.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`Only secure public URLs are allowed in ${label}.`);
}

function validateSeo(record, expectedPath, label, canonicalPaths) {
  const seo = record.data.seo;
  assertString(seo?.meta_title, `${label}.seo.meta_title`);
  assertString(seo?.meta_description, `${label}.seo.meta_description`);
  assertString(seo?.canonical_path, `${label}.seo.canonical_path`);
  const parsed = new URL(seo.canonical_path, `${productionOrigin}/`);
  if (parsed.origin !== productionOrigin || parsed.hash) throw new Error(`Invalid canonical path in ${label}.`);
  if (expectedPath && parsed.pathname !== expectedPath) throw new Error(`Canonical path in ${label} must use ${expectedPath}.`);
  const key = parsed.href;
  if (canonicalPaths.has(key)) throw new Error(`Duplicate canonical URL in ${label}; already used by ${canonicalPaths.get(key)}.`);
  canonicalPaths.set(key, label);
}

function collectImageReferences(models) {
  const references = [];
  const add = (value, label) => value && references.push([value, label]);
  for (const page of models.pages) {
    add(page.data.hero_image, `${page.source}.hero_image`);
    for (const item of page.data.hero_gallery || []) add(item.image, `${page.source}.hero_gallery.image`);
    for (const section of page.data.sections || []) add(section.image, `${page.source}.sections.image`);
  }
  for (const villa of models.villas) {
    add(villa.data.hero_image, `${villa.source}.hero_image`);
    for (const item of villa.data.gallery || []) add(item.image, `${villa.source}.gallery.image`);
  }
  for (const post of models.guidePosts) add(post.data.hero_image, `${post.source}.hero_image`);
  return references;
}

async function validateImageFiles(models) {
  const references = collectImageReferences(models);
  for (const [image, label] of references) {
    const absolute = resolve(projectRoot, image.replace(/^\/+/, ""));
    const assetRoot = resolve(projectRoot, "assets", "images");
    if (!absolute.startsWith(`${assetRoot}${sep}`) || !(await exists(absolute))) throw new Error(`Missing image file for ${label}: ${image}.`);
  }
}

function uniqueImagePaths(models) {
  return [...new Set(collectImageReferences(models).map(([image]) => String(image).replace(/^\/+/, "")))];
}

async function prepareResponsiveImageVariants(imagePaths, outputRoot) {
  const encode = (pipeline, extension, quality) => {
    if ([".jpg", ".jpeg"].includes(extension)) return pipeline.jpeg({ quality, progressive: true, chromaSubsampling: "4:2:0", mozjpeg: true });
    if (extension === ".png") return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: Math.min(quality + 8, 100) });
    if (extension === ".webp") return pipeline.webp({ quality, effort: 4 });
    if (extension === ".avif") return pipeline.avif({ quality: Math.max(quality - 20, 40), effort: 4 });
    throw new Error(`Unsupported CMS image format for responsive output: ${extension}.`);
  };

  for (const imagePath of imagePaths) {
    const input = resolve(projectRoot, imagePath);
    const stagedBase = resolve(outputRoot, imagePath);
    const extension = extname(imagePath).toLowerCase();
    const metadata = await sharp(input, { failOn: "warning" }).metadata();
    const oriented = metadata.autoOrient || metadata;
    if (!oriented.width || !oriented.height) throw new Error(`Could not read image dimensions: ${imagePath}.`);
    if (oriented.width < 1000) throw new Error(`Image must be at least 1000px wide for responsive output: ${imagePath}.`);
    const inputBytes = (await stat(input)).size;
    const hasMetadata = Boolean(metadata.orientation || metadata.exif || metadata.xmp || metadata.iptc);
    if (oriented.width > 1600 || inputBytes > 550 * 1024 || hasMetadata) {
      const basePipeline = sharp(input, { failOn: "warning" }).rotate().resize({ width: 1600, fit: "inside", withoutEnlargement: true });
      const optimizedBase = await encode(basePipeline, extension, 76).toBuffer();
      const mustReplace = hasMetadata || inputBytes > 550 * 1024 || optimizedBase.length < inputBytes;
      if (mustReplace) {
        await rm(stagedBase, { force: true });
        await mkdir(dirname(stagedBase), { recursive: true });
        await writeFile(stagedBase, optimizedBase);
      }
    }
    const stagedBaseBytes = (await stat(stagedBase)).size;
    if (stagedBaseBytes > 550 * 1024) throw new Error(`Optimized image exceeds the 550 KiB base-image budget: ${imagePath}.`);

    for (const targetWidth of [480, 960]) {
      const variantPath = imageVariantPath(imagePath, targetWidth);
      const destination = resolve(outputRoot, variantPath);
      if (!destination.startsWith(`${outputRoot}${sep}`)) throw new Error(`Unsafe image output path: ${variantPath}.`);
      await mkdir(dirname(destination), { recursive: true });
      await rm(destination, { force: true });
      const pipeline = sharp(input, { failOn: "warning" }).rotate().resize({ width: targetWidth, withoutEnlargement: true });
      await encode(pipeline, extension, 72).toFile(destination);
      const variantBytes = (await stat(destination)).size;
      const variantBudget = targetWidth === 480 ? 80 * 1024 : 180 * 1024;
      if (variantBytes > variantBudget) throw new Error(`Responsive ${targetWidth}px image exceeds its ${variantBudget / 1024} KiB budget: ${variantPath}.`);
    }
  }
}

function validateModels(models) {
  assertString(models.site.site_name, "site.site_name");
  assertString(models.site.brand_location, "site.brand_location");
  assertString(models.site.tagline, "site.tagline");
  assertString(models.site.footer_summary, "site.footer_summary");
  assertString(models.site.production_url, "site.production_url");
  const configuredProduction = new URL(models.site.production_url);
  if (configuredProduction.href.replace(/\/$/, "") !== productionOrigin) {
    throw new Error(`site.production_url must use ${productionOrigin}.`);
  }
  for (const key of ["street", "locality", "country_code"]) assertString(models.site.address?.[key], `site.address.${key}`);
  if (!/^[A-Z]{2}$/.test(models.site.address.country_code)) throw new Error("site.address.country_code must be a two-letter country code.");
  assertString(models.site.contact?.email, "site.contact.email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(models.site.contact.email)) throw new Error("Invalid site.contact.email.");
  assertString(models.site.contact?.phone_display, "site.contact.phone_display");
  if (!/^tel:\+[0-9]+$/.test(models.site.contact?.phone_link || "")) throw new Error("Invalid site.contact.phone_link.");
  for (const [index, social] of (models.site.social_links || []).entries()) {
    assertString(social?.label, `site.social_links[${index}].label`);
    validateNavigationUrl(social?.url, `site.social_links[${index}].url`, { externalOnly: true });
  }

  const seenRoutes = new Map();
  const canonicalPaths = new Map();
  const registerSlug = (scope, record) => {
    validateSlug(record.data.slug, `${record.source}.slug`);
    const routeKey = `${scope}/${record.data.slug}`;
    if (seenRoutes.has(routeKey)) {
      throw new Error(`Duplicate slug "${record.data.slug}" in ${record.source}; already used by ${seenRoutes.get(routeKey)}.`);
    }
    seenRoutes.set(routeKey, record.source);
  };

  for (const page of models.pages) {
    registerSlug("pages", page);
    validateStatus(page.data.status, `${page.source}.status`);
    if (!pageOutputs[page.data.slug]) throw new Error(`Unsupported fixed page slug "${page.data.slug}" in ${page.source}.`);
    for (const key of ["title", "nav_label", "hero_heading", "hero_intro", "hero_image", "hero_image_alt"]) {
      assertString(page.data[key], `${page.source}.${key}`);
    }
    validateImage(page.data.hero_image, `${page.source}.hero_image`);
    for (const [index, image] of (page.data.hero_gallery || []).entries()) {
      validateImage(image.image, `${page.source}.hero_gallery[${index}].image`);
      assertString(image.alt, `${page.source}.hero_gallery[${index}].alt`);
    }
    for (const [index, section] of (page.data.sections || []).entries()) {
      assertString(section?.heading, `${page.source}.sections[${index}].heading`);
      assertString(section?.text, `${page.source}.sections[${index}].text`);
      if (section.image) {
        validateImage(section.image, `${page.source}.sections[${index}].image`);
        assertString(section.image_alt, `${page.source}.sections[${index}].image_alt`);
      }
    }
    for (const key of ["heading", "text", "label", "url"]) assertString(page.data.call_to_action?.[key], `${page.source}.call_to_action.${key}`);
    validateNavigationUrl(page.data.call_to_action.url, `${page.source}.call_to_action.url`);
    const expectedCanonicalPath = page.data.slug === "home" ? "/" : `/${pageOutputs[page.data.slug]}`;
    validateSeo(page, expectedCanonicalPath, page.source, canonicalPaths);
  }

  for (const villa of models.villas) {
    registerSlug("villas", villa);
    validateStatus(villa.data.status, `${villa.source}.status`);
    for (const key of ["title", "summary", "booking_url", "hero_image", "hero_image_alt"]) {
      assertString(villa.data[key], `${villa.source}.${key}`);
    }
    validateImage(villa.data.hero_image, `${villa.source}.hero_image`);
    assertString(villa.data.location?.neighbourhood, `${villa.source}.location.neighbourhood`);
    assertString(villa.data.location?.parish, `${villa.source}.location.parish`);
    if (!["West Coast", "South Coast"].includes(villa.data.location?.coast)) throw new Error(`Invalid coast in ${villa.source}.`);
    validateNumber(villa.data.bedrooms, `${villa.source}.bedrooms`, { min: 1, max: 20 });
    validateNumber(villa.data.bathrooms, `${villa.source}.bathrooms`, { min: 0.5, max: 20 });
    validateNumber(villa.data.max_guests, `${villa.source}.max_guests`, { min: 1, max: 50, optional: true });
    validateNumber(villa.data.sort_order, `${villa.source}.sort_order`, { min: 0, max: 999 });
    if (typeof villa.data.featured !== "boolean") throw new Error(`Invalid featured flag in ${villa.source}.`);
    if (!Array.isArray(villa.data.gallery) || !villa.data.gallery.length) throw new Error(`At least one gallery image is required in ${villa.source}.`);
    if (villa.data.gallery.length > 20) throw new Error(`No more than 20 gallery images are allowed in ${villa.source}.`);
    for (const [index, image] of villa.data.gallery.entries()) {
      validateImage(image.image, `${villa.source}.gallery[${index}].image`);
      assertString(image.alt, `${villa.source}.gallery[${index}].alt`);
    }
    if (!Array.isArray(villa.data.amenities) || !villa.data.amenities.length) throw new Error(`At least one amenity is required in ${villa.source}.`);
    villa.data.amenities.forEach((amenity, index) => assertString(amenity, `${villa.source}.amenities[${index}]`));
    for (const [index, highlight] of (villa.data.highlights || []).entries()) {
      assertString(highlight?.title, `${villa.source}.highlights[${index}].title`);
      assertString(highlight?.description, `${villa.source}.highlights[${index}].description`);
    }
    const booking = new URL(villa.data.booking_url);
    if (
      booking.protocol !== "https:" ||
      booking.hostname !== "direct-book.com" ||
      !booking.pathname.startsWith("/properties/") ||
      booking.search ||
      booking.hash ||
      booking.username ||
      booking.password
    ) {
      throw new Error(`Invalid Direct-book base URL in ${villa.source}.`);
    }
    validateSeo(villa, "/villa.html", villa.source, canonicalPaths);
  }

  for (const post of models.guidePosts) {
    registerSlug("guide", post);
    validateStatus(post.data.status, `${post.source}.status`);
    for (const key of ["title", "author", "excerpt", "hero_image", "hero_image_alt"]) {
      assertString(post.data[key], `${post.source}.${key}`);
    }
    validateImage(post.data.hero_image, `${post.source}.hero_image`);
    if (!Array.isArray(post.data.categories) || !post.data.categories.length) throw new Error(`At least one category is required in ${post.source}.`);
    validateSeo(post, `/guide/${post.data.slug}.html`, post.source, canonicalPaths);
  }
}

function recordCanonical(record, outputPath, kind) {
  if (kind === "villa") return `${productionOrigin}/villas/${record.data.slug}.html`;
  if (kind === "guide") return `${productionOrigin}/guide/${record.data.slug}.html`;
  return canonicalUrl(record.data.seo?.canonical_path || (outputPath === "index.html" ? "/" : `/${outputPath}`));
}

function businessSchema(site) {
  return {
    "@type": ["LodgingBusiness", "Organization"],
    "@id": `${productionOrigin}/#business`,
    name: site.site_name,
    url: `${productionOrigin}/`,
    description: site.footer_summary,
    email: site.contact?.email,
    telephone: site.contact?.phone_display,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressCountry: site.address.country_code,
    },
  };
}

function schemaForRoute({ kind, record, canonical, site }) {
  if (kind === "villa") {
    const data = record.data;
    return {
      "@context": "https://schema.org",
      "@graph": [
        businessSchema(site),
        {
          "@type": "VacationRental",
          "@id": `${canonical}#villa`,
          url: canonical,
          name: data.title,
          description: data.summary,
          image: (data.gallery?.length ? data.gallery : [{ image: data.hero_image }]).map((item) => canonicalUrl(item.image)),
          address: {
            "@type": "PostalAddress",
            addressLocality: data.location?.neighbourhood,
            addressRegion: data.location?.parish,
            addressCountry: site.address.country_code,
          },
          numberOfBedrooms: data.bedrooms,
          numberOfBathroomsTotal: data.bathrooms,
          ...(data.max_guests ? { occupancy: { "@type": "QuantitativeValue", maxValue: data.max_guests } } : {}),
          amenityFeature: (data.amenities || []).map((name) => ({
            "@type": "LocationFeatureSpecification",
            name,
            value: true,
          })),
          provider: { "@id": `${productionOrigin}/#business` },
          potentialAction: { "@type": "ReserveAction", target: data.booking_url },
        },
      ],
    };
  }
  if (kind === "guide") {
    const data = record.data;
    return {
      "@context": "https://schema.org",
      "@graph": [
        businessSchema(site),
        {
          "@type": "BlogPosting",
          "@id": `${canonical}#article`,
          url: canonical,
          headline: data.title,
          description: data.excerpt,
          image: canonicalUrl(data.hero_image),
          datePublished: data.published_at,
          dateModified: data.updated_at || data.published_at,
          author: { "@type": "Person", name: data.author },
          publisher: { "@id": `${productionOrigin}/#business` },
          mainEntityOfPage: canonical,
        },
      ],
    };
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      businessSchema(site),
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: record.data.seo.meta_title,
        description: record.data.seo.meta_description,
        isPartOf: { "@type": "WebSite", "@id": `${productionOrigin}/#website`, url: `${productionOrigin}/`, name: site.site_name },
        about: { "@id": `${productionOrigin}/#business` },
        inLanguage: "en",
      },
    ],
  };
}

function renderHead({ kind, record, outputPath, mode, basePath, imageRoot = projectRoot, site, canonicalOverride, noindexOverride }) {
  const data = record.data;
  const canonical = canonicalOverride || recordCanonical(record, outputPath, kind);
  const title = data.seo?.meta_title || data.title;
  const description = data.seo?.meta_description || data.summary || data.excerpt || site.tagline;
  const image = data.hero_image || "/assets/images/new/pixieset-hero-balcony.jpg";
  const imageAlt = data.hero_image_alt || data.title || site.site_name;
  const noindex = noindexOverride ?? (mode === "preview" || Boolean(data.seo?.noindex));
  const schema = schemaForRoute({ kind, record, canonical, site });
  const stylesheet = kind === "guide" || (kind === "page" && !["index.html", "villas.html"].includes(outputPath)) ? "internal-pages.css" : "styles.css";
  const heroSizes = kind === "villa"
    ? "(max-width: 980px) calc(100vw - 36px), (max-width: 1320px) 70vw, 920px"
    : stylesheet === "internal-pages.css"
      ? "(max-width: 860px) calc(100vw - 48px), 50vw"
      : "100vw";
  return `  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#12343b" />
    <meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow"}" />
    <meta name="description" content="${escapeAttribute(description)}" />
    <link rel="canonical" href="${escapeAttribute(canonical)}" />
    <meta property="og:title" content="${escapeAttribute(title)}" />
    <meta property="og:description" content="${escapeAttribute(description)}" />
    <meta property="og:url" content="${escapeAttribute(canonical)}" />
    <meta property="og:image" content="${escapeAttribute(canonicalUrl(image))}" />
    <meta property="og:image:alt" content="${escapeAttribute(imageAlt)}" />
    <meta property="og:type" content="${kind === "guide" ? "article" : "website"}" />
    <meta property="og:site_name" content="${escapeAttribute(site.site_name)}" />
    <meta property="og:locale" content="en_BB" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttribute(title)}" />
    <meta name="twitter:description" content="${escapeAttribute(description)}" />
    <meta name="twitter:image" content="${escapeAttribute(canonicalUrl(image))}" />
    <meta name="twitter:image:alt" content="${escapeAttribute(imageAlt)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="${publicUrl("assets/favicon.svg", basePath)}" type="image/svg+xml" />
    <link rel="preload" href="${publicUrl("assets/fonts/dm-sans-latin.woff2", basePath)}" as="font" type="font/woff2" crossorigin />
    ${imagePreload(image, basePath, heroSizes, imageRoot)}
    <link rel="stylesheet" href="${publicUrl(stylesheet, basePath)}" />
    <script src="${publicUrl("analytics.js", basePath)}" data-ga-measurement-id="" defer></script>
    <script type="application/ld+json">${safeJson(schema)}</script>
  </head>`;
}

function replaceHead(html, head) {
  if (!/<head>[\s\S]*?<\/head>/i.test(html)) throw new Error("Template is missing a head element.");
  return html.replace(/\s*<head>[\s\S]*?<\/head>/i, `\n${head}`);
}

function replaceAttribute(tag, name, value) {
  const pattern = new RegExp(`\\s${name}=(['"])[\\s\\S]*?\\1`, "i");
  const rendered = ` ${name}="${escapeAttribute(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, rendered) : tag.replace(/\s*\/?\>$/, `${rendered}$&`);
}

function replaceHero(html, page) {
  let output = html.replace(/<h1\b([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${escapeHtml(page.data.hero_heading)}</h1>`);
  const headingEnd = output.search(/<\/h1>/i);
  if (headingEnd >= 0) {
    const prefix = output.slice(0, headingEnd + 5);
    const suffix = output.slice(headingEnd + 5);
    output = `${prefix}${suffix.replace(/<p\b([^>]*)>[\s\S]*?<\/p>/i, `<p$1>${escapeHtml(page.data.hero_intro)}</p>`)}`;
  }
  const mainIndex = output.search(/<main\b/i);
  if (mainIndex >= 0) {
    const beforeMain = output.slice(0, mainIndex);
    let main = output.slice(mainIndex);
    main = main.replace(/<img\b[^>]*>/i, (tag) => replaceAttribute(replaceAttribute(tag, "src", page.data.hero_image), "alt", safeImageAlt(page.data.hero_image_alt)));
    main = main.replace(/<\/h1>/i, `</h1><span class="visually-hidden cms-image-description">${escapeHtml(page.data.hero_image_alt)}</span>`);
    output = beforeMain + main;
  }
  return output;
}

function renderPageContent(page) {
  const sections = (page.data.sections || [])
    .map((section) => `<article class="cms-content-block"><h2>${escapeHtml(section.heading)}</h2><div class="rich-text">${renderMarkdown(section.text)}</div></article>`)
    .join("\n");
  return `<section class="section cms-managed-content" data-cms-source="${escapeAttribute(page.source)}">
        <div class="container">
          <p class="section-label">${escapeHtml(page.data.nav_label)}</p>
          <div class="rich-text">${renderMarkdown(page.body)}</div>
          ${sections}
        </div>
      </section>`;
}

function renderCallToAction(page, basePath) {
  const cta = page.data.call_to_action || {};
  return `<section class="section-tight section-teal cms-call-to-action">
        <div class="container centered-copy">
          <h2>${escapeHtml(cta.heading || "Explore Best E Villas")}</h2>
          <p>${escapeHtml(cta.text || "Find the Barbados villa that suits your stay.")}</p>
          <a class="button button-coral" href="${escapeAttribute(localReference(cta.url || "/villas.html", basePath))}">${escapeHtml(cta.label || "Explore villas")}</a>
        </div>
      </section>`;
}

function replaceLastSection(html, replacement) {
  const mainMatch = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (!mainMatch) throw new Error("Template is missing its main element.");
  const main = mainMatch[0];
  const matches = [...main.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)];
  if (!matches.length) return html.replace(/<\/main>/i, `${replacement}\n    </main>`);
  const last = matches.at(-1);
  const openingTag = last[0].match(/^<section\b[^>]*>/i)?.[0] || "";
  if (!/(?:closing-cta|section-tight)/i.test(openingTag)) {
    return html.replace(/<\/main>/i, `${replacement}\n    </main>`);
  }
  const replacedMain = `${main.slice(0, last.index)}${replacement}${main.slice(last.index + last[0].length)}`;
  return html.replace(main, replacedMain);
}

function insertBeforeClosingMain(html, content) {
  return html.replace(/<\/main>/i, `${content}\n    </main>`);
}

function insertBeforeLastCtaOrMain(html, content) {
  const mainMatch = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (!mainMatch) throw new Error("Template is missing its main element.");
  const main = mainMatch[0];
  const sections = [...main.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)];
  const last = sections.at(-1);
  const openingTag = last?.[0].match(/^<section\b[^>]*>/i)?.[0] || "";
  if (!last || !/(?:cms-call-to-action|closing-cta|section-tight)/i.test(openingTag)) return insertBeforeClosingMain(html, content);
  const renderedMain = `${main.slice(0, last.index)}${content}\n      ${main.slice(last.index)}`;
  return html.replace(main, renderedMain);
}

function renderVillaCards(villas, basePath, imageRoot = projectRoot) {
  return villas
    .map((record) => {
      const villa = record.data;
      const coast = String(villa.location?.coast || "").toLowerCase().includes("south") ? "south" : "west";
      const detail = publicUrl(`villas/${villa.slug}.html`, basePath);
      return `<article class="villa-result" data-villa-card data-location="${coast}" data-bedrooms="${escapeAttribute(villa.bedrooms)}">
              <a class="villa-result-image" href="${detail}"><img ${imageAttributes(villa.hero_image, basePath, { sizes: "(max-width: 760px) calc(100vw - 36px), (max-width: 1180px) 42vw, 280px", loading: "lazy", fetchPriority: "low" }, imageRoot)} alt="${escapeAttribute(villa.hero_image_alt)}" /></a>
              <div class="villa-result-body">
                <p class="villa-result-location">${escapeHtml(villa.location?.neighbourhood)}, ${escapeHtml(villa.location?.parish)}</p>
                <h3><a href="${detail}">${escapeHtml(villa.title)}</a></h3>
                <p>${escapeHtml(villa.summary)}</p>
                <ul class="villa-result-facts"><li>${escapeHtml(villa.bedrooms)} bedrooms</li><li>${escapeHtml(villa.bathrooms)} bathrooms</li></ul>
                <div class="villa-result-actions"><a class="text-link" href="${detail}">View villa</a><a class="button button-coral" href="${escapeAttribute(villa.booking_url)}" target="_blank" rel="noopener">Check availability</a></div>
              </div>
            </article>`;
    })
    .join("\n");
}

function replaceVillaCards(html, villas, basePath, imageRoot = projectRoot) {
  const cards = renderVillaCards(villas, basePath, imageRoot);
  const gridPattern = /(<div class="villa-results-grid">)[\s\S]*?(\r?\n\s*<\/div>\r?\n\s*<div class="empty-state")/i;
  if (!gridPattern.test(html)) return insertBeforeClosingMain(html, `<section class="section"><div class="container villa-results-grid">${cards}</div></section>`);
  let output = html.replace(gridPattern, `$1\n${cards}$2`);
  output = output.replace(/<strong id="villa-result-count"[^>]*>[\s\S]*?<\/strong>/i, `<strong id="villa-result-count" aria-live="polite">${villas.length} villas</strong>`);
  return output;
}

function replaceHomeGallery(html, page, basePath, imageRoot = projectRoot) {
  const gallery = page.data.hero_gallery || [];
  if (!gallery.length) return html;
  const slides = gallery
    .map((item, index) => `<figure class="hero-slide${index === 0 ? " active" : ""}" data-slide="${index}"${index === 0 ? "" : ' aria-hidden="true"'}><img ${imageAttributes(item.image, basePath, { sizes: "100vw", loading: index === 0 ? "eager" : "lazy", fetchPriority: index === 0 ? "high" : "low", placeholder: index > 0 }, imageRoot)} alt="${escapeAttribute(item.alt)}" /></figure>`)
    .join("\n          ");
  let output = html.replace(/<div class="hero-slides"[^>]*>[\s\S]*?<\/div>/i, `<div class="hero-slides" aria-live="polite">\n          ${slides}\n        </div>`);
  output = output.replace(/<span class="carousel-count"[^>]*>[\s\S]*?<\/span>/i, `<span class="carousel-count" aria-live="polite"><strong>01</strong> / ${String(gallery.length).padStart(2, "0")}</span>`);
  return output;
}

function renderGuideCards(posts, basePath, imageRoot = projectRoot) {
  if (!posts.length) return "";
  return `<section class="section cms-guide-list" aria-labelledby="guide-posts-title"><div class="container"><div class="section-heading"><div><p class="section-label">Latest stories</p><h2 id="guide-posts-title">From the Barbados Guide</h2></div></div><div class="guide-grid card-grid">${posts
    .map((post) => `<article class="guide-card editorial-card"><a href="${publicUrl(`guide/${post.data.slug}.html`, basePath)}"><div class="guide-image"><img ${imageAttributes(post.data.hero_image, basePath, { sizes: "(max-width: 760px) calc(100vw - 36px), (max-width: 1180px) 33vw, 370px", loading: "lazy", fetchPriority: "low" }, imageRoot)} alt="${escapeAttribute(safeImageAlt(post.data.hero_image_alt))}" /><span class="cms-image-description">${escapeHtml(post.data.hero_image_alt)}</span></div><div class="guide-card-body card-copy"><h3>${escapeHtml(post.data.title)}</h3><p>${escapeHtml(post.data.excerpt)}</p></div></a></article>`)
    .join("")}</div></div></section>`;
}

function localReference(value, basePath) {
  const reference = String(value ?? "").trim();
  if (!reference || /^(?:mailto:|tel:|#)/i.test(reference)) return reference;
  if (/^https:\/\//i.test(reference)) return reference;
  if (/^(?:http:|javascript:|data:|blob:|file:)/i.test(reference) || reference.includes("\\") || reference.includes("..")) {
    throw new Error(`Unsafe local reference: ${reference}`);
  }
  const villaMatch = reference.match(/^(?:\.\/|\/)?villa\.html\?villa=([a-z0-9-]+)(#.*)?$/i);
  if (villaMatch) return publicUrl(`villas/${villaMatch[1]}.html${villaMatch[2] || ""}`, basePath);
  const withoutLeading = reference.replace(/^\.\//, "").replace(/^\/+/, "");
  if (basePath !== "/" && reference.startsWith(basePath)) return reference;
  return publicUrl(withoutLeading, basePath);
}

function rewriteLocalReferences(html, basePath) {
  let output = html.replace(/\b(href|src|action)=(['"])(.*?)\2/gi, (_, name, quote, reference) => {
    return `${name}=${quote}${escapeAttribute(localReference(reference, basePath))}${quote}`;
  });
  output = output.replace(/\bsrcset=(['"])(.*?)\1/gi, (_, quote, sourceSet) => {
    const rendered = sourceSet
      .split(",")
      .map((candidate) => {
        const [url, descriptor] = candidate.trim().split(/\s+/, 2);
        return `${localReference(url, basePath)}${descriptor ? ` ${descriptor}` : ""}`;
      })
      .join(", ");
    return `srcset=${quote}${escapeAttribute(rendered)}${quote}`;
  });
  return output;
}

function hydrateGlobalContent(html, site, basePath) {
  let output = html;
  output = output.replace(/<strong>Best E Villas<\/strong>/g, `<strong>${escapeHtml(site.site_name)}</strong>`);
  output = output.replace(/<small>Barbados<\/small>/g, `<small>${escapeHtml(site.brand_location)}</small>`);
  output = output.replace(/href=(['"])mailto:[^'"]+\1/gi, `href="mailto:${escapeAttribute(site.contact.email)}"`);
  output = output.replace(/href=(['"])tel:[^'"]+\1/gi, `href="${escapeAttribute(site.contact.phone_link)}"`);
  output = output.replace(/errolbest@bestevillas\.com/gi, escapeHtml(site.contact.email));
  output = output.replace(/\+1 246 233 2814/g, escapeHtml(site.contact.phone_display));
  output = output.replace(/<div class="footer-brand">([\s\S]*?)<p>[\s\S]*?<\/p>/i, `<div class="footer-brand">$1<p>${escapeHtml(site.footer_summary)}</p><p>${escapeHtml(site.tagline)}</p>`);
  output = output.replace(/<p>St\. James, Barbados<\/p>/g, `<p>${escapeHtml(site.address.street)}, ${escapeHtml(site.address.locality)}, ${escapeHtml(site.address.country_code)}</p>`);
  return rewriteLocalReferences(output, basePath);
}

async function buildFixedPage(page, models, options) {
  const outputPath = pageOutputs[page.data.slug];
  await writeOutput(options.out, outputPath, renderFixedPageDocument(page, models, options));
  return routeManifest("page", page, outputPath, recordCanonical(page, outputPath, "page"), options);
}

function pageLabel(models, slug, fallback) {
  return models.publishedPages?.find((record) => record.data.slug === slug)?.data.nav_label || fallback;
}

function navMarkup(models, basePath, current = "", availabilityHref = "/villas.html") {
  const site = models.site;
  const items = [
    [pageLabel(models, "villas", "Villas"), "villas.html", "villas"],
    [pageLabel(models, "locations", "Locations"), "locations.html", "locations"],
    [pageLabel(models, "about", "Our Story"), "about.html", "about"],
    [pageLabel(models, "guide", "Barbados Guide"), "guide.html", "guide"],
    [pageLabel(models, "reviews", "Reviews"), "reviews.html", "reviews"],
  ];
  const links = items.map(([label, url, slug]) => `<a href="${publicUrl(url, basePath)}"${current === slug ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const availabilityUrl = localReference(availabilityHref, basePath);
  return `<header class="site-header solid-header" id="site-header"><div class="header-inner container-wide"><a class="brand" href="${publicUrl("index.html", basePath)}" aria-label="${escapeAttribute(site.site_name)} home"><img class="brand-logo" src="${publicUrl("assets/images/brand/best-e-villas-logo-white.png", basePath)}" width="1015" height="245" alt="" aria-hidden="true" decoding="async" loading="eager" /></a><nav class="desktop-nav" aria-label="Primary navigation">${links}</nav><div class="header-actions"><a class="button button-light header-cta" href="${escapeAttribute(availabilityUrl)}">Check availability</a><button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-navigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button></div></div><nav class="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation" aria-hidden="true">${links}<a href="${publicUrl("faq.html", basePath)}">${escapeHtml(pageLabel(models, "faq", "FAQs"))}</a><a class="button button-coral" href="${escapeAttribute(availabilityUrl)}">Check availability</a></nav></header>`;
}

function footerMarkup(models, basePath) {
  const site = models.site;
  const social = (site.social_links || []).map((item) => `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>`).join("");
  return `<footer class="site-footer"><div class="container footer-main"><div class="footer-brand"><a class="brand brand-footer" href="${publicUrl("index.html", basePath)}" aria-label="${escapeAttribute(site.site_name)} home"><img class="brand-logo" src="${publicUrl("assets/images/brand/best-e-villas-logo-white.png", basePath)}" width="1015" height="245" alt="" aria-hidden="true" decoding="async" loading="lazy" /></a><p>${escapeHtml(site.footer_summary)}</p><p>${escapeHtml(site.tagline)}</p></div><div class="footer-column"><h2>Explore</h2><a href="${publicUrl("villas.html", basePath)}">${escapeHtml(pageLabel(models, "villas", "Our Villas"))}</a><a href="${publicUrl("locations.html", basePath)}">${escapeHtml(pageLabel(models, "locations", "Locations"))}</a><a href="${publicUrl("guide.html", basePath)}">${escapeHtml(pageLabel(models, "guide", "Barbados Guide"))}</a><a href="${publicUrl("reviews.html", basePath)}">${escapeHtml(pageLabel(models, "reviews", "Guest Reviews"))}</a></div><div class="footer-column"><h2>About</h2><a href="${publicUrl("about.html", basePath)}">${escapeHtml(pageLabel(models, "about", "Our Story"))}</a><a href="${publicUrl("faq.html", basePath)}">${escapeHtml(pageLabel(models, "faq", "FAQs"))}</a><a href="${publicUrl("policies.html", basePath)}">${escapeHtml(pageLabel(models, "policies", "Policies"))}</a><a href="${publicUrl("contact.html", basePath)}">${escapeHtml(pageLabel(models, "contact", "Contact Us"))}</a>${social}</div><div class="footer-column footer-contact"><h2>Stay in touch</h2><a href="${escapeAttribute(site.contact.phone_link)}">${escapeHtml(site.contact.phone_display)}</a><a href="mailto:${escapeAttribute(site.contact.email)}">${escapeHtml(site.contact.email)}</a><p>${escapeHtml(site.address.street)}, ${escapeHtml(site.address.locality)}, ${escapeHtml(site.address.country_code)}</p></div></div><div class="container footer-bottom"><span>© <span data-current-year></span> ${escapeHtml(site.site_name)}.</span><span>Made for memorable Barbados stays.</span></div></footer>`;
}

function renderCmsSections(page, basePath, imageRoot = projectRoot) {
  const sections = page.data.sections || [];
  if (!sections.length) return "";
  if (page.data.slug === "faq") {
    return `<section class="section section-sand"><div class="container"><div class="faq-list">${sections.map((section) => `<details class="faq-item"><summary>${escapeHtml(section.heading)}</summary><div class="faq-answer rich-text">${renderMarkdown(section.text)}</div></details>`).join("")}</div></div></section>`;
  }
  return sections
    .map((section, index) => {
      const image = section.image
        ? `<figure class="framed-media split-media"><img ${imageAttributes(section.image, basePath, { sizes: "(max-width: 860px) calc(100vw - 48px), 50vw", loading: "lazy", fetchPriority: "low" }, imageRoot)} alt="${escapeAttribute(safeImageAlt(section.image_alt || section.heading))}" />${section.image_alt ? `<span class="cms-image-description">${escapeHtml(section.image_alt)}</span>` : ""}</figure>`
        : "";
      return `<section class="section${index % 2 === 0 ? " section-sand" : ""}"><div class="container ${image ? `split${index % 2 ? " split-reverse" : ""}` : "narrow-copy"}"><div class="split-copy"><h2>${escapeHtml(section.heading)}</h2><div class="rich-text">${renderMarkdown(section.text)}</div></div>${image}</div></section>`;
    })
    .join("\n");
}

function renderHomeVillaCards(villas, basePath, imageRoot = projectRoot) {
  return villas
    .map((record) => {
      const villa = record.data;
      const detail = publicUrl(`villas/${villa.slug}.html`, basePath);
      const firstAmenity = villa.amenities?.[0];
      return `<article class="villa-card reveal" data-location="${String(villa.location?.coast || "").toLowerCase().includes("south") ? "south" : "west"}" data-villa="${escapeAttribute(villa.slug)}"><div class="villa-image-wrap"><img ${imageAttributes(villa.hero_image, basePath, { sizes: "(max-width: 760px) calc(100vw - 36px), (max-width: 1180px) 33vw, 370px", loading: "lazy", fetchPriority: "low" }, imageRoot)} alt="${escapeAttribute(safeImageAlt(villa.hero_image_alt))}" /><span class="cms-image-description">${escapeHtml(villa.hero_image_alt)}</span><span class="villa-tag">${escapeHtml(villa.location?.coast)}</span></div><div class="villa-card-body"><div class="villa-location">${escapeHtml(villa.location?.neighbourhood)}, ${escapeHtml(villa.location?.parish)}</div><h3>${escapeHtml(villa.title)}</h3><p>${escapeHtml(villa.summary)}</p><div class="villa-meta"><span>${escapeHtml(villa.bedrooms)} bedrooms</span><span>${escapeHtml(villa.bathrooms)} bathrooms</span>${firstAmenity ? `<span>${escapeHtml(firstAmenity)}</span>` : ""}</div><div class="villa-card-footer"><a class="text-link" href="${detail}">View villa</a><a href="${escapeAttribute(villa.booking_url)}" target="_blank" rel="noopener">Check availability</a></div></div></article>`;
    })
    .join("\n");
}

function renderPageHero(page, basePath, imageRoot = projectRoot) {
  return `<section class="page-hero"><div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="${publicUrl("index.html", basePath)}">Home</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(page.data.nav_label)}</span></nav><div class="page-hero-grid"><div><h1>${escapeHtml(page.data.hero_heading)}</h1><p class="hero-copy">${escapeHtml(page.data.hero_intro)}</p></div><figure class="hero-media"><img ${imageAttributes(page.data.hero_image, basePath, { sizes: "(max-width: 860px) calc(100vw - 48px), 50vw", loading: "eager", fetchPriority: "high" }, imageRoot)} alt="${escapeAttribute(safeImageAlt(page.data.hero_image_alt))}" /><span class="cms-image-description">${escapeHtml(page.data.hero_image_alt)}</span></figure></div></div></section>`;
}

function renderBasePageBody(page, models, options) {
  const body = `<section class="section cms-managed-content" data-cms-source="${escapeAttribute(page.source)}"><div class="container narrow-copy"><p class="section-label">${escapeHtml(page.data.nav_label)}</p><div class="rich-text">${renderMarkdown(page.body)}</div></div></section>`;
  return `${renderPageHero(page, options.basePath, options.imageRoot)}${body}${renderCmsSections(page, options.basePath, options.imageRoot)}${page.data.slug === "guide" ? renderGuideCards(models.publishedGuidePosts, options.basePath, options.imageRoot) : ""}${renderCallToAction(page, options.basePath)}`;
}

function renderHomeMain(page, models, options) {
  const gallery = page.data.hero_gallery?.length ? page.data.hero_gallery : [{ image: page.data.hero_image, alt: page.data.hero_image_alt }];
  const slides = gallery.map((item, index) => `<figure class="hero-slide${index === 0 ? " active" : ""}" data-slide="${index}"${index ? ' aria-hidden="true"' : ""}><img ${imageAttributes(item.image, options.basePath, { sizes: "100vw", loading: index === 0 ? "eager" : "lazy", fetchPriority: index === 0 ? "high" : "low", placeholder: index > 0 }, options.imageRoot)} alt="${escapeAttribute(safeImageAlt(item.alt))}" /><span class="cms-image-description">${escapeHtml(item.alt)}</span></figure>`).join("");
  const featured = models.publishedVillas.filter((record) => record.data.featured);
  const cards = featured.length ? featured : models.publishedVillas;
  return `<main id="main-content" data-cms-source="${escapeAttribute(page.source)}"><section class="hero hero-carousel" id="top" aria-labelledby="hero-title" aria-roledescription="carousel"><div class="hero-slides" aria-live="polite">${slides}</div><div class="hero-content container"><h1 id="hero-title">${escapeHtml(page.data.hero_heading)}</h1><p class="hero-copy">${escapeHtml(page.data.hero_intro)}</p></div><div class="carousel-controls" aria-label="Villa gallery controls"><button class="carousel-button carousel-previous" type="button" aria-label="Previous image">←</button><span class="carousel-count" aria-live="polite"><strong>01</strong> / ${String(gallery.length).padStart(2, "0")}</span><button class="carousel-button carousel-next" type="button" aria-label="Next image">→</button></div></section><section class="booking-shell" id="booking" aria-label="Villa availability"><div class="booking-bar cms-booking-bar container"><div><strong>Find your Barbados villa</strong><p>Compare the collection, then use the existing booking partner for live dates and rates.</p></div><a class="button button-coral search-button" href="${publicUrl("villas.html", options.basePath)}">Check availability</a></div></section><section class="intro section-pad"><div class="container narrow-copy"><p class="eyebrow">${escapeHtml(page.data.nav_label)}</p><div class="rich-text">${renderMarkdown(page.body)}</div></div></section><section class="villas-section section-pad" id="villas"><div class="container"><div class="section-heading"><div><p class="eyebrow">Our collection</p><h2>Find your Barbados stay</h2></div><p>Four comfortable villas across Barbados’ West and South Coasts.</p></div><div class="villa-grid" id="villa-grid">${renderHomeVillaCards(cards, options.basePath, options.imageRoot)}</div></div></section>${renderCmsSections(page, options.basePath, options.imageRoot)}${renderCallToAction(page, options.basePath)}</main>`;
}

function renderListingMain(page, models, options) {
  return `<main id="main-content" data-cms-source="${escapeAttribute(page.source)}"><section class="listing-hero" aria-labelledby="listing-title"><img ${imageAttributes(page.data.hero_image, options.basePath, { sizes: "100vw", loading: "eager", fetchPriority: "high" }, options.imageRoot)} alt="${escapeAttribute(safeImageAlt(page.data.hero_image_alt))}" /><span class="cms-image-description">${escapeHtml(page.data.hero_image_alt)}</span><div class="listing-hero-copy container"><h1 id="listing-title">${escapeHtml(page.data.hero_heading)}</h1><p>${escapeHtml(page.data.hero_intro)}</p></div></section><section class="filter-section" aria-label="Filter villas"><form class="filter-bar container" id="villa-filter-form"><label><span>Location</span><select name="location"><option value="all">All locations</option><option value="west">West Coast</option><option value="south">South Coast</option></select></label><label><span>Bedrooms</span><select name="bedrooms"><option value="all">Any</option><option value="2">2+ bedrooms</option><option value="3">3+ bedrooms</option></select></label><button class="button button-coral" type="submit">Search villas</button><button class="filter-reset" type="reset">Reset</button></form></section><section class="villas-listing section-pad" id="villa-results" aria-labelledby="villa-results-title"><div class="container"><div class="listing-heading"><div><h2 id="villa-results-title">Our villas</h2><div class="rich-text">${renderMarkdown(page.body)}</div></div><strong id="villa-result-count" aria-live="polite">${models.publishedVillas.length} villas</strong></div><div class="villa-results-grid">${renderVillaCards(models.publishedVillas, options.basePath, options.imageRoot)}</div><div class="empty-state" id="villa-empty" hidden><h3>No villas match these filters.</h3><p>Reset the filters to see the complete collection.</p></div></div></section>${renderCmsSections(page, options.basePath, options.imageRoot)}${renderCallToAction(page, options.basePath)}</main>`;
}

function renderFixedPageDocument(page, models, options) {
  const outputPath = pageOutputs[page.data.slug];
  const head = renderHead({ kind: "page", record: page, outputPath, ...options, site: models.site });
  const main = page.data.slug === "home" ? renderHomeMain(page, models, options) : page.data.slug === "villas" ? renderListingMain(page, models, options) : `<main id="main-content" data-cms-source="${escapeAttribute(page.source)}">${renderBasePageBody(page, models, options)}</main>`;
  const availabilityHref = page.data.slug === "home" ? "#booking" : page.data.slug === "villas" ? "#villa-results" : "/villas.html";
  return `<!doctype html><html lang="en">\n${head}\n  <body${page.data.slug === "home" ? "" : ' class="inner-page"'}>\n    <a class="skip-link" href="#main-content">Skip to content</a>\n    ${navMarkup(models, options.basePath, page.data.slug, availabilityHref)}\n    ${main}\n    ${footerMarkup(models, options.basePath)}\n    <script src="${publicUrl("script.js", options.basePath)}"></script>\n  </body>\n</html>\n`;
}

function villaMain(record, basePath, imageRoot = projectRoot) {
  const villa = record.data;
  const gallery = villa.gallery?.length ? villa.gallery : [{ image: villa.hero_image, alt: villa.hero_image_alt }];
  const location = [villa.location?.neighbourhood, villa.location?.parish, villa.location?.coast].filter(Boolean).join(" · ");
  const facts = [`${villa.bedrooms} bedrooms`, `${villa.bathrooms} bathrooms`, ...(villa.max_guests ? [`Up to ${villa.max_guests} guests`] : []), ...(villa.amenities || [])];
  const highlights = (villa.highlights || []).length ? `<section class="section section-sand"><div class="container"><div class="section-heading"><div><p class="section-label">Villa highlights</p><h2>What makes this stay special</h2></div></div><div class="simple-feature-grid">${villa.highlights.map((highlight) => `<article><h3>${escapeHtml(highlight.title)}</h3><p>${escapeHtml(highlight.description)}</p></article>`).join("")}</div></div></section>` : "";
  const mainImage = imageAttributes(gallery[0].image, basePath, { sizes: "(max-width: 980px) calc(100vw - 36px), (max-width: 1320px) 70vw, 920px", loading: "eager", fetchPriority: "high" }, imageRoot);
  const thumbnails = gallery.map((item, index) => {
    const source = imageSourceData(item.image, basePath, imageRoot);
    return `<button class="gallery-thumbnail${index === 0 ? " active" : ""}" type="button" data-gallery-thumb data-gallery-index="${index}" data-gallery-src="${escapeAttribute(source.src)}" data-gallery-srcset="${escapeAttribute(source.srcset)}" data-gallery-alt="${escapeAttribute(safeImageAlt(item.alt))}" aria-label="Show photo ${index + 1} of ${gallery.length}" aria-pressed="${index === 0}"><img ${imageAttributes(item.image, basePath, { sizes: "240px", loading: "lazy", fetchPriority: "low", placeholder: true }, imageRoot)} alt="${escapeAttribute(safeImageAlt(item.alt))}" /></button><span class="visually-hidden cms-image-description">${escapeHtml(item.alt)}</span>`;
  }).join("");
  const secondaryIndex = Math.min(1, gallery.length - 1);
  const secondaryImage = imageAttributes(gallery[secondaryIndex].image, basePath, { sizes: "(max-width: 980px) calc(100vw - 36px), 45vw", loading: "lazy", fetchPriority: "low" }, imageRoot);
  return `<main id="main-content" data-cms-villa-page="${escapeAttribute(villa.slug)}">
      <section class="property-intro section-pad-sm"><div class="container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${publicUrl("villas.html", basePath)}">Villas</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(villa.title)}</span></nav><h1>${escapeHtml(villa.title)}</h1><p class="property-location">${escapeHtml(location)}</p></div></section>
      <section class="property-gallery-section" aria-label="Villa photo gallery"><div class="container property-gallery"><div class="gallery-main-frame"><img id="villa-main-image" ${mainImage} alt="${escapeAttribute(safeImageAlt(gallery[0].alt))}" /></div><div class="gallery-thumbnail-rail">${thumbnails}</div></div></section>
      <section class="property-summary section-pad-sm" id="availability"><div class="container property-summary-grid"><ul class="property-facts" aria-label="Villa facts">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul><div class="property-booking"><h2>Check live dates and rates</h2><p>The existing booking partner shows current availability and completes your reservation securely.</p><a class="button button-coral" href="${escapeAttribute(villa.booking_url)}" target="_blank" rel="noopener">Check availability</a></div></div></section>
      <section class="property-about section-pad"><div class="container property-about-grid"><div><p class="section-label">${escapeHtml(location)}</p><h2>About this villa</h2><p class="property-lead">${escapeHtml(villa.summary)}</p><div class="rich-text">${renderMarkdown(record.body)}</div><a class="text-link" href="${escapeAttribute(villa.booking_url)}" target="_blank" rel="noopener">View live availability</a></div><img ${secondaryImage} alt="${escapeAttribute(safeImageAlt(gallery[secondaryIndex].alt))}" /></div></section>
      <section class="amenities-section section-pad"><div class="container"><div class="section-heading"><div><p class="section-label">Included features</p><h2>Comfort for an easy stay</h2></div><p>Confirm the latest property details with the booking partner before reserving.</p></div><div class="simple-feature-grid">${(villa.amenities || []).map((amenity) => `<article><h3>${escapeHtml(amenity)}</h3><p>Available for a comfortable Best E Villas stay.</p></article>`).join("")}</div></div></section>
      ${highlights}
      <section class="section-tight section-teal"><div class="container centered-copy"><h2>Ready to check your dates?</h2><p>Continue to the external booking platform for current availability and rates.</p><a class="button button-coral" href="${escapeAttribute(villa.booking_url)}" target="_blank" rel="noopener">Check availability</a></div></section>
    </main>`;
}

function renderVillaDocument(record, models, options, { legacy = false } = {}) {
  const defaultCanonical = `${productionOrigin}/villas/${record.data.slug}.html`;
  const outputPath = legacy ? "villa.html" : `villas/${record.data.slug}.html`;
  const head = renderHead({
    kind: "villa",
    record,
    outputPath,
    ...options,
    site: models.site,
    canonicalOverride: defaultCanonical,
    noindexOverride: legacy ? true : undefined,
  });
  const legacyRedirect = legacy
    ? `<script>(() => { const routes = ${safeJson(Object.fromEntries(models.publishedVillas.map((villa) => [villa.data.slug, publicUrl(`villas/${villa.data.slug}.html`, options.basePath)])))}; const selected = new URLSearchParams(location.search).get("villa"); if (selected && routes[selected]) location.replace(routes[selected]); })();</script>`
    : "";
  return `<!doctype html><html lang="en">\n${head}\n  <body class="inner-page">\n    <a class="skip-link" href="#main-content">Skip to content</a>\n    ${navMarkup(models, options.basePath, "villas", "#availability")}\n    ${villaMain(record, options.basePath, options.imageRoot)}\n    ${footerMarkup(models, options.basePath)}\n    ${legacyRedirect}\n    <script src="${publicUrl("script.js", options.basePath)}"></script>\n    <script src="${publicUrl("cms-runtime.js", options.basePath)}"></script>\n  </body>\n</html>\n`;
}

function guideMain(record, basePath, imageRoot = projectRoot) {
  const post = record.data;
  const published = post.published_at ? new Date(`${post.published_at}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return `<main id="main-content"><article><header class="page-hero"><div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="${publicUrl("guide.html", basePath)}">Barbados Guide</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(post.title)}</span></nav><div class="page-hero-grid"><div><p class="section-label">${escapeHtml((post.categories || []).join(" · "))}</p><h1>${escapeHtml(post.title)}</h1><p class="hero-copy">${escapeHtml(post.excerpt)}</p><p>By ${escapeHtml(post.author)}${published ? ` · ${escapeHtml(published)}` : ""}</p></div><figure class="hero-media"><img ${imageAttributes(post.hero_image, basePath, { sizes: "(max-width: 860px) calc(100vw - 48px), 50vw", loading: "eager", fetchPriority: "high" }, imageRoot)} alt="${escapeAttribute(safeImageAlt(post.hero_image_alt))}" /><span class="visually-hidden cms-image-description">${escapeHtml(post.hero_image_alt)}</span></figure></div></div></header><section class="section"><div class="container article-copy rich-text">${renderMarkdown(record.body)}</div></section></article><section class="section-tight section-teal"><div class="container centered-copy"><h2>Find your place in Barbados</h2><p>Explore our villas and continue to the booking partner for live availability.</p><a class="button button-coral" href="${publicUrl("villas.html", basePath)}">Explore villas</a></div></section></main>`;
}

function renderGuideDocument(record, models, options) {
  const outputPath = `guide/${record.data.slug}.html`;
  const head = renderHead({ kind: "guide", record, outputPath, ...options, site: models.site });
  return `<!doctype html><html lang="en">\n${head}\n  <body class="inner-page">\n    <a class="skip-link" href="#main-content">Skip to content</a>\n    ${navMarkup(models, options.basePath, "guide", "/villas.html")}\n    ${guideMain(record, options.basePath, options.imageRoot)}\n    ${footerMarkup(models, options.basePath)}\n    <script src="${publicUrl("script.js", options.basePath)}"></script>\n  </body>\n</html>\n`;
}

function routeManifest(kind, record, outputPath, canonical, options, override = {}) {
  return {
    kind,
    slug: override.slug || record.data.slug,
    source: override.source || record.source,
    outputPath,
    urlPath: publicUrl(outputPath === "index.html" ? "" : outputPath, options.basePath),
    canonical,
    title: record.data.seo?.meta_title || record.data.title,
    status: record.data.status || "published",
    noindex: override.noindex ?? (options.mode === "preview" || Boolean(record.data.seo?.noindex)),
    contentNoindex: override.noindex ?? Boolean(record.data.seo?.noindex),
  };
}

async function writeOutput(outputRoot, outputPath, content) {
  const target = resolve(outputRoot, outputPath);
  if (target !== outputRoot && !target.startsWith(`${outputRoot}${sep}`)) throw new Error(`Unsafe output path: ${outputPath}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function runtimeScript() {
  return `(() => {
  const main = document.querySelector("[data-cms-villa-page]");
  if (!main) return;
  const image = document.querySelector("#villa-main-image");
  let requestId = 0;
  document.querySelectorAll("[data-gallery-thumb]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!image) return;
      const nextSource = button.dataset.gallerySrc;
      const nextSourceSet = button.dataset.gallerySrcset;
      const nextAlt = button.dataset.galleryAlt || image.alt;
      if (!nextSource || button.getAttribute("aria-busy") === "true") return;
      const currentRequest = ++requestId;

      const thumbnail = button.querySelector("img");
      const thumbnailReady = thumbnail?.complete && thumbnail.naturalWidth > 0;
      if (thumbnailReady) {
        image.removeAttribute("srcset");
        image.src = thumbnail.currentSrc || thumbnail.src;
        image.alt = nextAlt;
      }
      document.querySelectorAll("[data-gallery-thumb]").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");

      const preload = new Image();
      button.setAttribute("aria-busy", "true");
      preload.decoding = "async";
      preload.sizes = image.sizes || "(max-width: 980px) calc(100vw - 36px), (max-width: 1320px) 70vw, 920px";
      const loaded = await new Promise((resolveLoad) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolveLoad(value);
        };
        const timeout = setTimeout(() => finish(false), 8000);
        preload.addEventListener("load", () => finish(true), { once: true });
        preload.addEventListener("error", () => finish(false), { once: true });
        if (nextSourceSet) preload.srcset = nextSourceSet;
        preload.src = nextSource;
        if (preload.complete && preload.naturalWidth > 0) finish(true);
      });
      if (loaded && currentRequest === requestId) {
        try { await preload.decode(); } catch {}
        image.removeAttribute("srcset");
        image.src = preload.currentSrc || nextSource;
        image.alt = nextAlt;
      }
      button.removeAttribute("aria-busy");
    });
  });
})();\n`;
}

function siteContentScript(models) {
  const payload = {
    site: models.site,
    pages: models.publishedPages.map((record) => ({ ...record.data, body: record.body })),
    villas: models.publishedVillas.map((record) => ({ ...record.data, body: record.body })),
    guidePosts: models.publishedGuidePosts.map((record) => ({ ...record.data, body: record.body })),
  };
  return `globalThis.bestEVillasContent = ${safeJson(payload)};\n`;
}

function sitemapXml(routes) {
  const urls = routes.filter((route) => !route.contentNoindex && route.kind !== "legacy-villa").map((route) => route.canonical);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function robotsTxt(mode) {
  if (mode === "preview") return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${productionOrigin}/sitemap.xml\n`;
}

async function copySharedFiles(outputRoot) {
  for (const file of sharedFiles) {
    await cp(resolve(projectRoot, file), resolve(outputRoot, file));
  }
  await cp(resolve(projectRoot, "assets"), resolve(outputRoot, "assets"), { recursive: true });
}

async function assertReplaceableOutput(outputRoot) {
  if (!(await exists(outputRoot))) return;
  const manifestPath = resolve(outputRoot, "content-manifest.json");
  if (!(await exists(manifestPath))) {
    throw new Error(`Refusing to replace ${outputRoot}: it is not a recognized Best E Villas build directory.`);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(`Refusing to replace ${outputRoot}: its build manifest is invalid.`);
  }
  if (manifest?.schemaVersion !== 1 || manifest?.build?.origin !== productionOrigin) {
    throw new Error(`Refusing to replace ${outputRoot}: its build manifest is not owned by this renderer.`);
  }
}

async function publishStagedBuild(stagingRoot, outputRoot) {
  const outputExists = await exists(outputRoot);
  const backupRoot = `${outputRoot}.previous-${process.pid}-${Date.now()}`;
  if (outputExists) await rename(outputRoot, backupRoot);
  try {
    await rename(stagingRoot, outputRoot);
  } catch (error) {
    if (outputExists && (await exists(backupRoot))) await rename(backupRoot, outputRoot);
    throw error;
  }
  if (outputExists) await rm(backupRoot, { recursive: true, force: true });
}

export async function buildSite(providedOptions = {}) {
  const defaults = parseArguments([]);
  const options = {
    ...defaults,
    ...providedOptions,
    content: resolve(providedOptions.content || defaults.content),
    out: resolve(providedOptions.out || defaults.out),
    mode: providedOptions.mode || defaults.mode,
    basePath: normalizeBasePath(providedOptions.basePath || defaults.basePath),
  };
  if (!new Set(["preview", "production"]).has(options.mode)) throw new Error(`Invalid build mode: ${options.mode}`);

  if (options.out === projectRoot || options.out === resolve(options.out, sep)) throw new Error("Refusing to replace a filesystem or project root.");
  if (options.out === options.content || options.content.startsWith(`${options.out}${sep}`) || options.out.startsWith(`${options.content}${sep}`)) {
    throw new Error("The output directory and content source must not overlap.");
  }
  const models = await loadContent(options.content);
  validateModels(models);
  await validateImageFiles(models);
  models.publishedPages = models.pages.filter((record) => record.data.status === "published");
  models.publishedVillas = models.villas.filter((record) => record.data.status === "published").sort((a, b) => (a.data.sort_order || 0) - (b.data.sort_order || 0));
  models.publishedGuidePosts = models.guidePosts.filter((record) => record.data.status === "published").sort((a, b) => String(b.data.published_at || "").localeCompare(String(a.data.published_at || "")));
  const publishedImageReferences = uniqueImagePaths({
    pages: models.publishedPages,
    villas: models.publishedVillas,
    guidePosts: models.publishedGuidePosts,
  });
  if (models.publishedPages.length !== Object.keys(pageOutputs).length) throw new Error("All nine fixed pages must be published for this build.");
  if (!models.publishedVillas.length) throw new Error("At least one published villa is required.");
  await assertReplaceableOutput(options.out);
  await mkdir(dirname(options.out), { recursive: true });
  let stagingRoot = await mkdtemp(resolve(dirname(options.out), `.${basename(options.out)}-build-`));
  try {
    const renderOptions = { ...options, out: stagingRoot, imageRoot: stagingRoot };
    await copySharedFiles(stagingRoot);
    await prepareResponsiveImageVariants(publishedImageReferences, stagingRoot);
    await writeOutput(stagingRoot, "cms-runtime.js", runtimeScript());
    await writeOutput(stagingRoot, "site-content.js", siteContentScript(models));

    const routes = [];
    for (const page of models.publishedPages) routes.push(await buildFixedPage(page, models, renderOptions));
    for (const villa of models.publishedVillas) {
      const outputPath = `villas/${villa.data.slug}.html`;
      await writeOutput(stagingRoot, outputPath, renderVillaDocument(villa, models, renderOptions));
      routes.push(routeManifest("villa", villa, outputPath, recordCanonical(villa, outputPath, "villa"), renderOptions));
    }
    for (const post of models.publishedGuidePosts) {
      const outputPath = `guide/${post.data.slug}.html`;
      await writeOutput(stagingRoot, outputPath, renderGuideDocument(post, models, renderOptions));
      routes.push(routeManifest("guide", post, outputPath, recordCanonical(post, outputPath, "guide"), renderOptions));
    }

    const defaultVilla = models.publishedVillas[0];
    await writeOutput(stagingRoot, "villa.html", renderVillaDocument(defaultVilla, models, renderOptions, { legacy: true }));
    routes.push(routeManifest("legacy-villa", defaultVilla, "villa.html", `${productionOrigin}/villas/${defaultVilla.data.slug}.html`, renderOptions, { slug: "legacy-villa", source: "compatibility", noindex: true }));

    const manifest = {
      schemaVersion: 1,
      build: {
        mode: options.mode,
        basePath: options.basePath,
        origin: productionOrigin,
        generatedAt: new Date().toISOString(),
      },
      sources: {
        site: "site.yml",
        pages: models.publishedPages.map((record) => record.source),
        villas: models.publishedVillas.map((record) => record.source),
        guidePosts: models.publishedGuidePosts.map((record) => record.source),
      },
      routes: routes.sort((a, b) => a.outputPath.localeCompare(b.outputPath)),
    };
    await writeOutput(stagingRoot, "content-manifest.json", JSON.stringify(manifest, null, 2));
    await writeOutput(stagingRoot, "robots.txt", robotsTxt(options.mode));
    await writeOutput(stagingRoot, "sitemap.xml", sitemapXml(routes));
    await publishStagedBuild(stagingRoot, options.out);
    stagingRoot = null;
    return manifest;
  } finally {
    if (stagingRoot && (await exists(stagingRoot))) await rm(stagingRoot, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const manifest = await buildSite(options);
    console.log(`Built ${manifest.routes.length} routes in ${manifest.build.mode} mode at ${manifest.build.basePath}`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
