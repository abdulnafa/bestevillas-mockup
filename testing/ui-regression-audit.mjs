import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, posix, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { readAvifDimensions, readWebpDimensions } from "../scripts/build.mjs";

const root = resolve(".");
const distDir = resolve(root, process.env.UI_AUDIT_DIST || "dist");
const evidencePath = resolve(root, "testing", "evidence", "ui-regression-audit.json");
const rasterExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const imageBudgets = {
  base: 550 * 1024,
  width480: 80 * 1024,
  width960: 180 * 1024,
};
const results = [];
const budgetedImages = new Set();
const imageMetadata = new Map();

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

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function attributes(tag) {
  const parsed = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    parsed[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return parsed;
}

function classList(tag) {
  return new Set((attributes(tag).class || "").split(/\s+/).filter(Boolean));
}

function normalizeBasePath(value) {
  const text = String(value || "/").trim();
  if (!text || text === "/") return "/";
  return `/${text.replace(/^\/+|\/+$/g, "")}/`;
}

function isExternalReference(value) {
  return !value || value.startsWith("#") || value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value);
}

function localOutputPath(reference, ownerOutputPath, basePath) {
  let value = decodeHtml(reference).trim();
  if (isExternalReference(value)) return null;
  value = value.split("#", 1)[0].split("?", 1)[0];
  if (!value) return null;

  let outputPath;
  let baseMismatch = false;
  if (value.startsWith("/")) {
    const baseRoot = basePath === "/" ? "/" : basePath.slice(0, -1);
    if (basePath !== "/" && value === baseRoot) {
      value = "";
    } else if (basePath !== "/" && value.startsWith(basePath)) {
      value = value.slice(basePath.length);
    } else {
      baseMismatch = basePath !== "/";
      value = value.replace(/^\/+/, "");
    }
    outputPath = value;
  } else {
    outputPath = posix.join(posix.dirname(ownerOutputPath), value);
  }

  outputPath = posix.normalize(outputPath).replace(/^\.\//, "");
  if (!outputPath || outputPath === ".") outputPath = "index.html";
  if (outputPath.endsWith("/")) outputPath += "index.html";
  if (outputPath === ".." || outputPath.startsWith("../")) return { outside: true, baseMismatch, outputPath };
  return { outside: false, baseMismatch, outputPath };
}

function parseSrcset(value) {
  return String(value || "")
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
}

async function dimensions(path) {
  if (!imageMetadata.has(path)) {
    imageMetadata.set(path, sharp(path, { failOn: "warning" }).metadata());
  }
  return imageMetadata.get(path);
}

function extractAtRuleBlock(css, headerPattern) {
  const match = headerPattern.exec(css);
  if (!match) return "";
  const open = css.indexOf("{", match.index + match[0].length - 1);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return "";
}

function ruleBody(css, selectorPattern) {
  const match = new RegExp(`(?:^|})\\s*${selectorPattern}\\s*\\{([^{}]*)\\}`, "s").exec(css);
  return match?.[1] || "";
}

function hasDeclaration(body, property, valuePattern) {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*${valuePattern}\\s*(?:;|$)`, "i").test(body);
}

async function auditReference(reference, ownerOutputPath, basePath, seen) {
  const local = localOutputPath(reference, ownerOutputPath, basePath);
  if (!local) return;
  const key = `${ownerOutputPath}\0${local.outputPath}`;
  if (seen.has(key)) return;
  seen.add(key);

  const absolute = resolve(distDir, ...local.outputPath.split("/"));
  const withinDist = !local.outside && (absolute === distDir || absolute.startsWith(`${distDir}${sep}`));
  const present = withinDist && !local.baseMismatch && (await exists(absolute));
  record(
    "local-references",
    `${ownerOutputPath} -> ${reference}`,
    "local target exists inside dist",
    present,
    present ? local.outputPath : local.outside ? "reference escapes dist" : local.baseMismatch ? `missing deployed base path ${basePath}` : local.outputPath,
  );
}

async function auditImageBudget(reference, ownerOutputPath, basePath) {
  const local = localOutputPath(reference, ownerOutputPath, basePath);
  if (!local || local.outside || budgetedImages.has(local.outputPath)) return;
  const extension = extname(local.outputPath).toLowerCase();
  if (!rasterExtensions.has(extension)) return;
  budgetedImages.add(local.outputPath);

  const absolute = resolve(distDir, ...local.outputPath.split("/"));
  if (!(await exists(absolute))) return;
  const bytes = (await stat(absolute)).size;
  const file = posix.basename(local.outputPath);
  const limit = /-480\.(?:jpe?g|png|webp|avif)$/i.test(file)
    ? imageBudgets.width480
    : /-960\.(?:jpe?g|png|webp|avif)$/i.test(file)
      ? imageBudgets.width960
      : imageBudgets.base;
  record(
    "image-budget",
    local.outputPath,
    `image is no larger than ${Math.round(limit / 1024)} KiB`,
    bytes <= limit,
    `${Math.round(bytes / 1024)} KiB`,
  );
}

async function auditHtmlReferences(html, outputPath, basePath) {
  const seen = new Set();
  const directAttributeNames = new Set(["src", "href", "poster", "data-responsive-src", "data-gallery-src"]);
  const srcsetAttributeNames = new Set(["srcset", "imagesrcset", "data-responsive-srcset", "data-gallery-srcset"]);
  for (const tag of html.match(/<[^!][^>]*>/g) || []) {
    const attrs = attributes(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (directAttributeNames.has(name)) {
        await auditReference(value, outputPath, basePath, seen);
        await auditImageBudget(value, outputPath, basePath);
      }
      if (srcsetAttributeNames.has(name)) {
        for (const candidate of parseSrcset(value)) {
          await auditReference(candidate, outputPath, basePath, seen);
          await auditImageBudget(candidate, outputPath, basePath);
        }
      }
    }
  }
}

async function auditCssReferences(css, outputPath, basePath) {
  const seen = new Set();
  for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi)) {
    const reference = match[1] ?? match[2] ?? match[3];
    await auditReference(reference, outputPath, basePath, seen);
    await auditImageBudget(reference, outputPath, basePath);
  }
}

async function auditGeneratedImages(html, outputPath, basePath) {
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  record("responsive-images", outputPath, "route contains at least one generated image", imageTags.length > 0, `${imageTags.length} images`);

  let eagerCount = 0;
  let highPriorityCount = 0;
  for (const [index, tag] of imageTags.entries()) {
    const attrs = attributes(tag);
    const target = `${outputPath} image ${index + 1}`;
    const width = Number(attrs.width);
    const height = Number(attrs.height);
    const isBrandLogo = classList(tag).has("brand-logo");

    if (isBrandLogo) {
      record("brand-logo", target, "uses the approved transparent logo asset", /assets\/images\/brand\/best-e-villas-logo-white\.png$/i.test(attrs.src || ""), attrs.src || "missing");
      record("brand-logo", target, "declares the validated intrinsic logo dimensions", width === 1015 && height === 245, `${attrs.width || "missing"}x${attrs.height || "missing"}`);
      record("brand-logo", target, "is decorative inside an accessible brand link", attrs.alt === "" && attrs["aria-hidden"] === "true", `alt=${JSON.stringify(attrs.alt)}, aria-hidden=${attrs["aria-hidden"] || "missing"}`);
      record("brand-logo", target, "uses asynchronous decoding and an explicit load strategy", attrs.decoding === "async" && ["eager", "lazy"].includes(attrs.loading), `${attrs.decoding || "missing"}/${attrs.loading || "missing"}`);
      continue;
    }

    const responsiveSrcset = attrs.srcset || attrs["data-responsive-srcset"] || "";
    const candidateEntries = responsiveSrcset.split(",").map((item) => {
      const [url, descriptor] = item.trim().split(/\s+/, 2);
      return { url, descriptor };
    }).filter((entry) => entry.url);
    const candidates = candidateEntries.map((entry) => entry.url);
    const descriptors = candidateEntries.map((entry) => entry.descriptor);

    if (attrs.loading === "eager") eagerCount += 1;
    if (attrs.fetchpriority === "high") highPriorityCount += 1;
    record("responsive-images", target, "has positive intrinsic width and height", width > 0 && height > 0, `${attrs.width || "missing"}x${attrs.height || "missing"}`);
    record("responsive-images", target, "uses asynchronous decoding", attrs.decoding === "async", attrs.decoding || "missing");
    record("responsive-images", target, "declares responsive display sizes", Boolean(attrs.sizes), attrs.sizes || "missing");
    record("responsive-images", target, "declares responsive source candidates", candidates.length >= 3, `${candidates.length} candidates`);
    record("responsive-images", target, "includes 480w and 960w variants", descriptors.includes("480w") && descriptors.includes("960w"), descriptors.join(", "));
    record("responsive-images", target, "uses an explicit loading strategy", ["eager", "lazy"].includes(attrs.loading), attrs.loading || "missing");
    record("responsive-images", target, "uses a matching fetch priority", (attrs.loading === "eager" && attrs.fetchpriority === "high") || (attrs.loading === "lazy" && attrs.fetchpriority === "low"), `${attrs.loading || "missing"}/${attrs.fetchpriority || "missing"}`);

    for (const candidate of candidateEntries) {
      const local = localOutputPath(candidate.url, outputPath, basePath);
      const absolute = local && !local.outside && !local.baseMismatch ? resolve(distDir, ...local.outputPath.split("/")) : "";
      const present = Boolean(absolute) && (await exists(absolute));
      record("responsive-images", `${target} -> ${candidate.url}`, "responsive candidate exists", present, local?.outputPath || "invalid local candidate");
      if (present) {
        const metadata = await dimensions(absolute);
        const declaredWidth = Number.parseInt(candidate.descriptor, 10);
        record("responsive-images", `${target} -> ${candidate.url}`, "width descriptor matches decoded image", Number.isFinite(declaredWidth) && metadata.width === declaredWidth, `${candidate.descriptor || "missing"}; decoded=${metadata.width || "unknown"}x${metadata.height || "unknown"}`);
        const declaredRatio = width / height;
        const decodedRatio = metadata.width / metadata.height;
        record("responsive-images", `${target} -> ${candidate.url}`, "candidate aspect ratio matches intrinsic dimensions", Number.isFinite(declaredRatio) && Number.isFinite(decodedRatio) && Math.abs(declaredRatio - decodedRatio) < 0.01, `intrinsic=${declaredRatio.toFixed(4)}, decoded=${decodedRatio.toFixed(4)}`);
      }
    }
  }

  record("loading-strategy", outputPath, "only one image loads eagerly", eagerCount === 1, `${eagerCount} eager images`);
  record("loading-strategy", outputPath, "only one image has high fetch priority", highPriorityCount === 1, `${highPriorityCount} high-priority images`);
}

function auditNavigationMarkup(html, outputPath) {
  const toggleTag = (html.match(/<button\b[^>]*class="[^"]*\bmenu-toggle\b[^"]*"[^>]*>/i) || [""])[0];
  const navTag = (html.match(/<nav\b[^>]*class="[^"]*\bmobile-nav\b[^"]*"[^>]*>/i) || [""])[0];
  const headerTag = (html.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>/i) || [""])[0];
  const toggle = attributes(toggleTag);
  const nav = attributes(navTag);
  record("navigation", outputPath, "mobile toggle starts closed", toggle["aria-expanded"] === "false", toggle["aria-expanded"] || "missing");
  record("navigation", outputPath, "mobile navigation starts hidden", nav["aria-hidden"] === "true", nav["aria-hidden"] || "missing");
  record("navigation", outputPath, "toggle controls the generated navigation", Boolean(nav.id) && toggle["aria-controls"] === nav.id, `${toggle["aria-controls"] || "missing"} -> ${nav.id || "missing"}`);
  record("navigation", outputPath, "header is not initially menu-active", !classList(headerTag).has("menu-active"));
}

function auditDeferredHomeMedia(html) {
  const slideBlocks = html.match(/<figure\b[^>]*class="[^"]*\bhero-slide\b[^"]*"[^>]*>[\s\S]*?<\/figure>/gi) || [];
  record("deferred-media", "index.html", "homepage has multiple hero slides", slideBlocks.length >= 3, `${slideBlocks.length} slides`);
  slideBlocks.forEach((block, index) => {
    const figureTag = (block.match(/<figure\b[^>]*>/i) || [""])[0];
    const imageTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    const figureClasses = classList(figureTag);
    const image = attributes(imageTag);
    const target = `index.html hero slide ${index + 1}`;
    if (index === 0) {
      record("deferred-media", target, "first hero is active and prioritized", figureClasses.has("active") && image.loading === "eager" && image.fetchpriority === "high" && Boolean(image.srcset));
      return;
    }
    record("deferred-media", target, "later hero is hidden initially", attributes(figureTag)["aria-hidden"] === "true");
    record("deferred-media", target, "later hero starts with a small placeholder", /-480\.(?:jpe?g|png|webp|avif)$/i.test(image.src || ""), image.src || "missing");
    record("deferred-media", target, "later hero is lazy and low priority", image.loading === "lazy" && image.fetchpriority === "low", `${image.loading || "missing"}/${image.fetchpriority || "missing"}`);
    record("deferred-media", target, "later hero keeps upgrade sources", Boolean(image["data-responsive-src"]) && Boolean(image["data-responsive-srcset"]));
  });
}

function auditDeferredVillaGallery(html, outputPath) {
  const mainTag = (html.match(/<img\b[^>]*\bid="villa-main-image"[^>]*>/i) || [""])[0];
  const main = attributes(mainTag);
  record("deferred-media", outputPath, "main gallery image is prioritized", main.loading === "eager" && main.fetchpriority === "high" && Boolean(main.srcset));

  const thumbnailBlocks = html.match(/<button\b[^>]*\bdata-gallery-thumb\b[^>]*>[\s\S]*?<\/button>/gi) || [];
  record("deferred-media", outputPath, "gallery contains deferred thumbnails", thumbnailBlocks.length >= 3, `${thumbnailBlocks.length} thumbnails`);
  thumbnailBlocks.forEach((block, index) => {
    const buttonTag = (block.match(/<button\b[^>]*>/i) || [""])[0];
    const imageTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    const button = attributes(buttonTag);
    const image = attributes(imageTag);
    const target = `${outputPath} thumbnail ${index + 1}`;
    record("deferred-media", target, "thumbnail starts with a small lazy source", /-480\.(?:jpe?g|png|webp|avif)$/i.test(image.src || "") && image.loading === "lazy" && image.fetchpriority === "low", `${image.src || "missing"} (${image.loading || "missing"}/${image.fetchpriority || "missing"})`);
    record("deferred-media", target, "thumbnail keeps responsive upgrade sources", Boolean(image["data-responsive-src"]) && Boolean(image["data-responsive-srcset"]));
    record("deferred-media", target, "gallery control provides responsive main-image sources", Boolean(button["data-gallery-src"]) && Boolean(button["data-gallery-srcset"]));
  });
}

function auditInternalCss(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const firstMedia = clean.indexOf("@media");
  const base = firstMedia >= 0 ? clean.slice(0, firstMedia) : clean;
  const mobile = extractAtRuleBlock(clean, /@media\s*\(\s*max-width\s*:\s*860px\s*\)/i);
  const navBody = ruleBody(base, "\\.mobile-nav");
  const directNavBody = ruleBody(base, "\\.site-header\\s*>\\s*\\.mobile-nav");
  const toggleBody = ruleBody(base, "\\.menu-toggle");
  const openNavBody = ruleBody(mobile, "\\.site-header\\.menu-active\\s*>\\s*\\.mobile-nav");
  const wideContainerBody = ruleBody(base, "\\.container-wide");
  const headerActionsBody = ruleBody(base, "\\.header-actions");
  const frameBody = ruleBody(base, "\\.framed-media\\s*,\\s*\\.split-media");
  const frameImageBody = ruleBody(base, "\\.framed-media\\s+img\\s*,\\s*\\.split-media\\s+img");

  record("css-contract", "internal-pages.css", "mobile navigation is hidden by default", hasDeclaration(navBody, "display", "none") && hasDeclaration(directNavBody, "display", "none"));
  record("css-contract", "internal-pages.css", "mobile menu toggle is hidden on desktop", hasDeclaration(toggleBody, "display", "none"));
  record("css-contract", "internal-pages.css", "mobile navigation opens only through menu-active state", Boolean(mobile) && hasDeclaration(openNavBody, "display", "grid"));
  record("css-contract", "internal-pages.css", "wide header container is bounded and centered", hasDeclaration(wideContainerBody, "width", "min\\([^;]*1400px\\)") && hasDeclaration(wideContainerBody, "margin-inline", "auto"));
  record("css-contract", "internal-pages.css", "header actions use a non-shrinking flex row", hasDeclaration(headerActionsBody, "display", "flex") && hasDeclaration(headerActionsBody, "flex", "0\\s+0\\s+auto"));
  record("css-contract", "internal-pages.css", "split media has a controlled 4:3 frame", hasDeclaration(frameBody, "aspect-ratio", "4\\s*\\/\\s*3") && hasDeclaration(frameBody, "overflow", "hidden"));
  record("css-contract", "internal-pages.css", "split media images fill the frame without distortion", hasDeclaration(frameImageBody, "width", "100%") && hasDeclaration(frameImageBody, "height", "100%") && hasDeclaration(frameImageBody, "object-fit", "cover"));
}

function auditVillaGalleryCss(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const galleryStart = clean.indexOf(".property-gallery");
  const galleryScope = galleryStart >= 0 ? clean.slice(galleryStart) : "";
  const galleryBody = ruleBody(galleryScope, "\\.property-gallery");
  const boundedItemsBody = ruleBody(galleryScope, "\\.gallery-main-frame\\s*,\\s*\\.gallery-thumbnail");
  const boundedTracksBody = ruleBody(galleryScope, "\\.gallery-main-frame\\s*,\\s*\\.gallery-thumbnail-rail");
  const imageBody = ruleBody(galleryScope, "\\.gallery-main-frame\\s+img\\s*,\\s*\\.gallery-thumbnail\\s+img");
  const desktopRailBody = ruleBody(galleryScope, "\\.gallery-thumbnail-rail");
  const mobile = extractAtRuleBlock(galleryScope, /@media\s*\(\s*max-width\s*:\s*980px\s*\)/i);
  const mobileGalleryBody = ruleBody(mobile, "\\.property-gallery");
  const mobileMainBody = ruleBody(mobile, "\\.gallery-main-frame");
  const mobileRailBody = ruleBody(mobile, "\\.gallery-thumbnail-rail");
  const boundedRow = hasDeclaration(galleryBody, "grid-template-rows", "minmax\\(\\s*0\\s*,\\s*1fr\\s*\\)");
  const boundedHeight = hasDeclaration(galleryBody, "height", "clamp\\([^;]+\\)");

  record("css-contract", "styles.css", "desktop villa gallery uses a bounded grid row", boundedRow && boundedHeight, JSON.stringify({ boundedRow, boundedHeight, declarations: galleryBody.trim() }));
  record("css-contract", "styles.css", "villa gallery items may shrink inside the fixed track", hasDeclaration(boundedItemsBody, "min-height", "0") && hasDeclaration(boundedItemsBody, "min-width", "0") && hasDeclaration(boundedItemsBody, "overflow", "hidden"));
  record("css-contract", "styles.css", "main frame and thumbnail rail stay within the gallery height", hasDeclaration(boundedTracksBody, "height", "100%") && hasDeclaration(boundedTracksBody, "min-height", "0") && hasDeclaration(boundedTracksBody, "min-width", "0"));
  record("css-contract", "styles.css", "villa gallery images fill without forcing intrinsic track growth", hasDeclaration(imageBody, "display", "block") && hasDeclaration(imageBody, "height", "100%") && hasDeclaration(imageBody, "max-height", "100%") && hasDeclaration(imageBody, "object-fit", "cover") && hasDeclaration(imageBody, "width", "100%"));
  record("css-contract", "styles.css", "desktop thumbnail rail supports extended galleries without overflow", hasDeclaration(desktopRailBody, "grid-template-columns", "repeat\\(\\s*2\\s*,[^;]+\\)") && hasDeclaration(desktopRailBody, "grid-auto-rows", "minmax\\([^;]+\\)") && hasDeclaration(desktopRailBody, "overflow-y", "auto"));
  record("css-contract", "styles.css", "mobile villa gallery restores content-driven layout with a horizontal thumbnail rail", hasDeclaration(mobileGalleryBody, "height", "auto") && hasDeclaration(mobileGalleryBody, "grid-template-rows", "auto") && hasDeclaration(mobileMainBody, "height", "auto") && hasDeclaration(mobileRailBody, "height", "auto") && hasDeclaration(mobileRailBody, "grid-auto-flow", "column") && hasDeclaration(mobileRailBody, "grid-template-rows", "1fr") && hasDeclaration(mobileRailBody, "overflow-x", "auto") && hasDeclaration(mobileRailBody, "overflow-y", "hidden"));
}

function auditMediaParserContract(pagesConfig, rendererSource) {
  const mediaBlock = /^media:\s*\n([\s\S]*?)(?=^[a-z][\w-]*\s*:)/im.exec(pagesConfig)?.[1] || "";
  const extensionList = /extensions\s*:\s*\[([^\]]+)\]/i.exec(mediaBlock)?.[1] || "";
  const configured = extensionList
    .split(",")
    .map((extension) => extension.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
    .filter(Boolean);
  const expected = ["jpg", "jpeg", "png", "webp", "avif"];
  record("media-parser", ".pages.yml", "CMS media extensions remain explicit and complete", expected.every((extension) => configured.includes(extension)), configured.join(", ") || "missing");

  const parserSignatures = {
    jpg: /buffer\[0\]\s*===\s*0xff[\s\S]*buffer\[1\]\s*===\s*0xd8[\s\S]*startOfFrameMarkers/,
    jpeg: /buffer\[0\]\s*===\s*0xff[\s\S]*buffer\[1\]\s*===\s*0xd8[\s\S]*startOfFrameMarkers/,
    png: /toString\("ascii",\s*1,\s*4\)\s*===\s*"PNG"[\s\S]*readUInt32BE\(16\)[\s\S]*readUInt32BE\(20\)/,
    webp: /readWebpDimensions[\s\S]*"RIFF"[\s\S]*"WEBP"[\s\S]*"VP8X"[\s\S]*"VP8L"[\s\S]*"VP8 "/,
    avif: /readAvifDimensions[\s\S]*"ftyp"[\s\S]*indexOf\("ispe"[\s\S]*\.avif/,
  };
  for (const extension of configured) {
    const supported = parserSignatures[extension]?.test(rendererSource) || false;
    record("media-parser", extension, "configured CMS image type has a dimension parser", supported);
  }

  const webpFixture = Buffer.alloc(30);
  webpFixture.write("RIFF", 0);
  webpFixture.writeUInt32LE(22, 4);
  webpFixture.write("WEBP", 8);
  webpFixture.write("VP8X", 12);
  webpFixture.writeUInt32LE(10, 16);
  webpFixture.writeUIntLE(639, 24, 3);
  webpFixture.writeUIntLE(479, 27, 3);
  const webpDimensions = readWebpDimensions(webpFixture);
  record("media-parser", "webp fixture", "WebP dimensions are parsed functionally", webpDimensions?.width === 640 && webpDimensions?.height === 480, JSON.stringify(webpDimensions));

  const avifFixture = Buffer.alloc(40);
  avifFixture.writeUInt32BE(20, 0);
  avifFixture.write("ftyp", 4);
  avifFixture.write("avif", 8);
  avifFixture.write("avif", 16);
  avifFixture.writeUInt32BE(20, 20);
  avifFixture.write("ispe", 24);
  avifFixture.writeUInt32BE(800, 32);
  avifFixture.writeUInt32BE(600, 36);
  const avifDimensions = readAvifDimensions(avifFixture);
  record("media-parser", "avif fixture", "AVIF dimensions are parsed functionally", avifDimensions?.width === 800 && avifDimensions?.height === 600, JSON.stringify(avifDimensions));
}

await mkdir(dirname(evidencePath), { recursive: true });

try {
  const packageData = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  record(
    "release-contract",
    "package.json",
    "test:ui runs this focused regression audit",
    packageData.scripts?.["test:ui"] === "node testing/ui-regression-audit.mjs",
    packageData.scripts?.["test:ui"] || "missing",
  );
  const workflow = await readFile(resolve(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
  const buildPosition = workflow.indexOf("npm run build");
  const cmsPosition = workflow.indexOf("npm run test:cms");
  const uiPosition = workflow.indexOf("npm run test:ui");
  const uploadPosition = workflow.indexOf("actions/upload-pages-artifact");
  record(
    "release-contract",
    ".github/workflows/deploy-pages.yml",
    "UI regression audit runs after build/CMS checks and before upload",
    buildPosition >= 0 && cmsPosition > buildPosition && uiPosition > cmsPosition && uploadPosition > uiPosition,
    `build=${buildPosition}, cms=${cmsPosition}, ui=${uiPosition}, upload=${uploadPosition}`,
  );
  const pagesConfig = await readFile(resolve(root, ".pages.yml"), "utf8");
  const rendererSource = await readFile(resolve(root, "scripts", "build.mjs"), "utf8");
  auditMediaParserContract(pagesConfig, rendererSource);

  const manifestPath = resolve(distDir, "content-manifest.json");
  const manifestPresent = await exists(manifestPath);
  record("precondition", "dist/content-manifest.json", "generated build manifest exists", manifestPresent);
  if (!manifestPresent) throw new Error("Run the site build before the UI regression audit.");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const basePath = normalizeBasePath(manifest.build?.basePath);
  const routePaths = [...new Set((manifest.routes || []).map((route) => route.outputPath).filter(Boolean))];
  record("precondition", "content-manifest.json", "generated routes are listed", routePaths.length >= 14, `${routePaths.length} routes`);

  const htmlByRoute = new Map();
  for (const outputPath of routePaths) {
    const absolute = resolve(distDir, ...outputPath.split("/"));
    const present = await exists(absolute);
    record("routes", outputPath, "generated HTML route exists", present);
    if (!present) continue;
    const html = await readFile(absolute, "utf8");
    htmlByRoute.set(outputPath, html);
    record("runtime-payload", outputPath, "unused site-content payload is not publicly included", !/\bsite-content\.js\b/i.test(html));
    await auditHtmlReferences(html, outputPath, basePath);
    await auditGeneratedImages(html, outputPath, basePath);
    if (html.includes("internal-pages.css")) auditNavigationMarkup(html, outputPath);
  }

  const indexHtml = htmlByRoute.get("index.html") || "";
  auditDeferredHomeMedia(indexHtml);
  for (const route of manifest.routes || []) {
    if (["villa", "legacy-villa"].includes(route.kind) && htmlByRoute.has(route.outputPath)) {
      auditDeferredVillaGallery(htmlByRoute.get(route.outputPath), route.outputPath);
    }
  }

  const locationsHtml = htmlByRoute.get("locations.html") || "";
  const splitFigures = locationsHtml.match(/<figure\b[^>]*class="[^"]*\bsplit-media\b[^"]*"[^>]*>[\s\S]*?<\/figure>/gi) || [];
  record("split-media", "locations.html", "all three location images use controlled split-media frames", splitFigures.length === 3, `${splitFigures.length} frames`);
  for (const [index, block] of splitFigures.entries()) {
    const figureTag = (block.match(/<figure\b[^>]*>/i) || [""])[0];
    const imageTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    record("split-media", `locations.html frame ${index + 1}`, "frame uses both shared media classes", classList(figureTag).has("framed-media") && classList(figureTag).has("split-media"));
    record("split-media", `locations.html frame ${index + 1}`, "image is lazy and responsive", attributes(imageTag).loading === "lazy" && Boolean(attributes(imageTag).srcset));
  }

  for (const stylesheet of ["styles.css", "internal-pages.css"]) {
    const absolute = resolve(distDir, stylesheet);
    const present = await exists(absolute);
    record("routes", stylesheet, "generated stylesheet exists", present);
    if (!present) continue;
    const css = await readFile(absolute, "utf8");
    await auditCssReferences(css, stylesheet, basePath);
    if (stylesheet === "internal-pages.css") auditInternalCss(css);
    if (stylesheet === "styles.css") auditVillaGalleryCss(css);
  }
} catch (error) {
  record("runtime", "ui-regression-audit", "audit completes without uncaught error", false, error.stack || error.message);
}

const failed = results.filter((result) => !result.passed);
const report = {
  generatedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  total: results.length,
  budgetsKiB: {
    base: imageBudgets.base / 1024,
    width480: imageBudgets.width480 / 1024,
    width960: imageBudgets.width960 / 1024,
  },
  failed,
  results,
};
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, total: report.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
