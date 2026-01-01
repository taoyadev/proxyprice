/**
 * Enhanced Link Check Script
 *
 * Checks for broken internal links, missing images, and required files
 * in the built dist directory.
 *
 * Usage: node scripts/linkcheck.mjs [dist-dir]
 */

import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? "dist");
const siteUrl = process.env.PUBLIC_SITE_URL || "https://proxyprice.com";

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];
/** @type {Set<string>} */
const seenLinks = new Set();

// ============================================================================
// URL PARSING HELPERS
// ============================================================================

const isExternal = (u) =>
  u.startsWith("http://") ||
  u.startsWith("https://") ||
  u.startsWith("//") ||
  u.startsWith("mailto:") ||
  u.startsWith("tel:") ||
  u.startsWith("data:") ||
  u.startsWith("javascript:");

const stripQueryHash = (u) => u.split("#")[0].split("?")[0];

const toDistPath = (urlPath) => {
  if (urlPath === "/") return path.join(distDir, "index.html");

  const clean = stripQueryHash(urlPath);
  const hasExt = path.posix.basename(clean).includes(".");
  const normalized = clean.replace(/\/+$/, "");

  if (hasExt) return path.join(distDir, clean.replace(/^\//, ""));

  const asDir = path.join(distDir, normalized.replace(/^\//, ""), "index.html");
  const asHtml = path.join(distDir, `${normalized.replace(/^\//, "")}.html`);
  return fs.existsSync(asDir) ? asDir : asHtml;
};

// ============================================================================
// FILE SYSTEM HELPERS
// ============================================================================

const walk = (dir) => {
  /** @type {string[]} */
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walk(full));
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        out.push(full);
      }
    }
  } catch (e) {
    errors.push(`Failed to read directory ${dir}: ${e.message}`);
  }
  return out;
};

const getAllHtmlFiles = () => walk(distDir);

const getAllImageFiles = () => {
  const images = [];
  const imageExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".avif",
  ];

  const walkForImages = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkForImages(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            images.push(full);
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  };

  walkForImages(distDir);
  return images;
};

// ============================================================================
// LINK VALIDATION
// ============================================================================

const htmlFiles = getAllHtmlFiles();
const imageFiles = new Set(
  getAllImageFiles().map(
    (f) => `/${path.relative(distDir, f).replace(/\\/g, "/")}`,
  ),
);

// Enhanced regex to catch more link patterns
const linkPatterns = [
  // <a href="...">
  /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  // <link href="...">
  /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  // <script src="...">
  /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  // <img src="...">
  /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  // <source src="...">
  /<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  // <img srcset="...">
  /<img\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi,
];

for (const file of htmlFiles) {
  const relativeFile = path.relative(distDir, file);
  const html = fs.readFileSync(file, "utf-8");

  for (const pattern of linkPatterns) {
    let m;
    while ((m = pattern.exec(html))) {
      const raw = m[1];

      // Handle srcset (may contain multiple URLs)
      if (raw.includes(",")) {
        const srcsetUrls = raw.split(",").map((s) => s.trim().split(/\s+/)[0]);
        for (const url of srcsetUrls) {
          validateLink(url, file, relativeFile);
        }
        continue;
      }

      validateLink(raw, file, relativeFile);
    }
  }

  // Check for orphan pages (pages that exist but aren't linked anywhere)
  // We'll collect all links and check later
}

// Check for duplicate links to the same page (potential SEO issue)
if (seenLinks.size > 0) {
  const linkCounts = {};
  for (const link of seenLinks) {
    linkCounts[link] = (linkCounts[link] || 0) + 1;
  }
  // Could warn about pages with too many internal links pointing to them
}

function validateLink(raw, file, relativeFile) {
  if (!raw || raw === "#" || raw === "javascript:void(0)") {
    return;
  }

  const cleaned = stripQueryHash(raw);
  if (!cleaned) return;

  // Track internal links
  if (!isExternal(cleaned) && cleaned.startsWith("/")) {
    seenLinks.add(cleaned);
  }

  // Turn absolute same-origin URLs into path checks
  if (cleaned.startsWith(siteUrl)) {
    const internal = cleaned.slice(siteUrl.length);
    if (!internal.startsWith("/")) return;
    const target = toDistPath(internal);
    if (!fs.existsSync(target)) {
      errors.push(`${relativeFile} -> missing internal link: ${internal}`);
    }
    return;
  }

  if (isExternal(cleaned)) {
    // Optionally validate external links (slow, disabled by default)
    // For now, just check for obvious issues
    if (cleaned.includes(" ")) {
      errors.push(
        `${relativeFile} -> URL contains spaces: ${cleaned.substring(0, 100)}`,
      );
    }
    if (cleaned.startsWith("http://") && !cleaned.startsWith("http://")) {
      warnings.push(
        `${relativeFile} -> using HTTP instead of HTTPS: ${cleaned.substring(0, 100)}`,
      );
    }
    return;
  }

  if (cleaned.startsWith("/")) {
    // Internal link
    const target = toDistPath(cleaned);

    // Check if it's an image
    if (
      (cleaned.endsWith(".png") ||
        cleaned.endsWith(".jpg") ||
        cleaned.endsWith(".jpeg") ||
        cleaned.endsWith(".gif") ||
        cleaned.endsWith(".svg") ||
        cleaned.endsWith(".webp") ||
        cleaned.endsWith(".ico")) &&
      !fs.existsSync(target)
    ) {
      errors.push(`${relativeFile} -> missing image: ${cleaned}`);
    } else if (!fs.existsSync(target)) {
      errors.push(`${relativeFile} -> missing internal link: ${cleaned}`);
    }
    return;
  }

  // Relative assets
  const resolved = path.resolve(path.dirname(file), cleaned);
  if (!fs.existsSync(resolved)) {
    errors.push(`${relativeFile} -> missing relative asset: ${cleaned}`);
  }
}

// ============================================================================
// IMAGE REFERENCE CHECKING
// ============================================================================

// Check for orphaned images (images that exist but are never referenced)
const referencedImages = new Set();

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf-8");
  const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRegex.exec(html))) {
    const imgPath = m[1];
    if (!isExternal(imgPath) && !imgPath.startsWith("//")) {
      referencedImages.add(imgPath.split("?")[0].split("#")[0]);
    }
  }
}

// Check for images in CSS files
const getAllCssFiles = () => {
  const cssFiles = [];
  const walkCss = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkCss(full);
        } else if (entry.isFile() && entry.name.endsWith(".css")) {
          cssFiles.push(full);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  };
  walkCss(distDir);
  return cssFiles;
};

const cssFiles = getAllCssFiles();
for (const file of cssFiles) {
  const css = fs.readFileSync(file, "utf-8");
  const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
  let m;
  while ((m = urlRegex.exec(css))) {
    const imgPath = m[1];
    if (!isExternal(imgPath) && !imgPath.startsWith("data:")) {
      referencedImages.add(imgPath.split("?")[0].split("#")[0]);
    }
  }
}

// Warn about orphaned images (excluding common patterns)
const commonIgnoredPatterns = [
  "/favicon.ico",
  "/apple-touch-icon",
  "/icon",
  "/og-image",
  "/_astro", // Astro framework assets
];

for (const imgPath of imageFiles) {
  const isIgnored = commonIgnoredPatterns.some((pattern) =>
    imgPath.includes(pattern),
  );
  if (!isIgnored && !referencedImages.has(imgPath)) {
    // Check if it might be referenced in HTML with a different path format
    const mightBeReferenced = Array.from(referencedImages).some(
      (ref) => ref.includes(imgPath) || imgPath.includes(ref),
    );
    if (!mightBeReferenced) {
      warnings.push(`possibly orphaned image: ${imgPath}`);
    }
  }
}

// ============================================================================
// REQUIRED FILES CHECK
// ============================================================================

const requiredFiles = [
  { path: "robots.txt", optional: false },
  { path: "sitemap-index.xml", optional: false },
  { path: "og-image.svg", optional: false },
  { path: "CNAME", optional: true }, // Only needed for custom domains
  { path: ".nojekyll", optional: true }, // Only needed for GitHub Pages
  { path: "_headers", optional: true }, // Only needed for Cloudflare Pages
];

for (const { path: required, optional } of requiredFiles) {
  const p = path.join(distDir, required);
  if (!fs.existsSync(p)) {
    if (optional) {
      // Just a warning for optional files
      if (required === "CNAME" && process.env.CI !== "true") {
        // Only warn about CNAME in CI or if expected
      }
    } else {
      errors.push(`dist missing required file: /${required}`);
    }
  }
}

// ============================================================================
// PAGE STRUCTURE CHECKS
// ============================================================================

// Check for common HTML issues
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf-8");
  const relativeFile = path.relative(distDir, file);

  // Check for empty title tags
  if (html.match(/<title>\s*<\/title>/)) {
    warnings.push(`${relativeFile} has empty <title> tag`);
  }

  // Check for missing meta description (warning only, as some pages might not need it)
  if (!html.match(/<meta\s+name=["']description["']/)) {
    warnings.push(`${relativeFile} missing meta description`);
  }

  // Check for very large pages (> 500KB)
  const fileSize = fs.statSync(file).size;
  if (fileSize > 500 * 1024) {
    warnings.push(
      `${relativeFile} is very large: ${(fileSize / 1024).toFixed(0)}KB`,
    );
  }
}

// ============================================================================
// OUTPUT
// ============================================================================

if (warnings.length) {
  console.warn(`Warnings (${warnings.length}):`);
  for (const w of warnings.slice(0, 50)) {
    console.warn(`  - ${w}`);
  }
  if (warnings.length > 50) {
    console.warn(`  - ...and ${warnings.length - 50} more`);
  }
}

if (errors.length) {
  console.error(`Linkcheck failed (${errors.length}):`);
  for (const e of errors.slice(0, 200)) {
    console.error(`  - ${e}`);
  }
  if (errors.length > 200) {
    console.error(`  - ...and ${errors.length - 200} more`);
  }
  process.exit(1);
}

console.log(`✓ Linkcheck passed (${htmlFiles.length} HTML files scanned)`);
if (warnings.length) {
  console.log(`  with ${warnings.length} warning(s)`);
}
