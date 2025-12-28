import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? "dist");
const siteUrl = "https://proxyprice.com";

/** @type {string[]} */
const errors = [];

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

const walk = (dir) => {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
};

const htmlFiles = walk(distDir);

const attrRe = /<(a|link|script|img)\b[^>]*(href|src)=["']([^"']+)["'][^>]*>/gi;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf-8");
  let m;
  while ((m = attrRe.exec(html))) {
    const raw = m[3];
    if (!raw || raw === "#") continue;

    const cleaned = stripQueryHash(raw);
    if (!cleaned) continue;

    // Turn absolute same-origin URLs into path checks
    if (cleaned.startsWith(siteUrl)) {
      const internal = cleaned.slice(siteUrl.length);
      if (!internal.startsWith("/")) continue;
      const target = toDistPath(internal);
      if (!fs.existsSync(target)) {
        errors.push(`${path.relative(distDir, file)} -> missing ${internal}`);
      }
      continue;
    }

    if (isExternal(cleaned)) continue;

    if (cleaned.startsWith("/")) {
      const target = toDistPath(cleaned);
      if (!fs.existsSync(target)) {
        errors.push(`${path.relative(distDir, file)} -> missing ${cleaned}`);
      }
      continue;
    }

    // Relative assets (rare): resolve relative to current HTML directory
    const resolved = path.resolve(path.dirname(file), cleaned);
    if (!fs.existsSync(resolved)) {
      errors.push(
        `${path.relative(distDir, file)} -> missing relative ${cleaned}`,
      );
    }
  }
}

for (const required of [
  "robots.txt",
  "sitemap-index.xml",
  "og-image.svg",
  "CNAME",
  ".nojekyll",
  "_headers",
]) {
  const p = path.join(distDir, required);
  if (!fs.existsSync(p))
    errors.push(`dist missing required file: /${required}`);
}

if (errors.length) {
  console.error(`Linkcheck failed (${errors.length}):`);
  for (const e of errors.slice(0, 200)) console.error(`- ${e}`);
  if (errors.length > 200)
    console.error(`- ...and ${errors.length - 200} more`);
  process.exit(1);
}

console.log(`✓ Linkcheck passed (${htmlFiles.length} HTML files scanned)`);
