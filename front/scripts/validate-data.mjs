import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const providersPath = path.join(projectRoot, "src", "data", "providers.json");
const pricingPath = path.join(projectRoot, "src", "data", "pricing.json");
const redirectsPath = path.join(projectRoot, "src", "data", "redirects.json");

const providersData = JSON.parse(fs.readFileSync(providersPath, "utf-8"));
const pricingData = JSON.parse(fs.readFileSync(pricingPath, "utf-8"));
const redirectsData = fs.existsSync(redirectsPath)
  ? JSON.parse(fs.readFileSync(redirectsPath, "utf-8"))
  : null;

/** @type {string[]} */
const errors = [];

const providers = providersData.providers ?? [];
const pricing = pricingData.pricing ?? [];
const redirects = redirectsData?.providers ?? null;

if (providersData.total_count !== providers.length) {
  errors.push(
    `providers.json total_count mismatch: ${providersData.total_count} != ${providers.length}`,
  );
}

if (pricingData.total_count !== pricing.length) {
  errors.push(
    `pricing.json total_count mismatch: ${pricingData.total_count} != ${pricing.length}`,
  );
}

const providerIds = new Set();
for (const p of providers) {
  if (!p?.id) errors.push(`provider missing id: ${JSON.stringify(p)}`);
  if (providerIds.has(p.id)) errors.push(`duplicate provider id: ${p.id}`);
  providerIds.add(p.id);
  if (p.slug && p.slug !== p.id) {
    errors.push(`provider slug != id for ${p.id}: ${p.slug}`);
  }
  try {
    const u = new URL(p.website_url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      errors.push(
        `provider website_url has invalid protocol for ${p.id}: ${p.website_url}`,
      );
    }
  } catch {
    errors.push(
      `provider website_url is not a valid URL for ${p.id}: ${p.website_url}`,
    );
  }
}

if (
  redirectsData &&
  (redirectsData.providers == null ||
    typeof redirectsData.providers !== "object")
) {
  errors.push("redirects.json is missing top-level 'providers' object");
}

if (redirects && typeof redirects === "object") {
  for (const [slug, entry] of Object.entries(redirects)) {
    if (!providerIds.has(slug)) {
      errors.push(`redirects.json references unknown provider slug: ${slug}`);
      continue;
    }
    if (entry == null || typeof entry !== "object") {
      errors.push(`redirects.json entry must be an object for ${slug}`);
      continue;
    }

    const url = entry.url ?? null;
    const affiliate = entry.affiliate ?? null;
    if (url == null && affiliate == null) {
      errors.push(
        `redirects.json entry has neither url nor affiliate for ${slug}`,
      );
      continue;
    }

    for (const [label, value] of [
      ["url", url],
      ["affiliate", affiliate],
    ]) {
      if (value == null) continue;
      if (typeof value !== "string" || value.length === 0) {
        errors.push(
          `redirects.json ${label} must be a non-empty string or null for ${slug}`,
        );
        continue;
      }
      try {
        const u = new URL(value);
        if (u.protocol !== "https:" && u.protocol !== "http:") {
          errors.push(
            `redirects.json ${label} has invalid protocol for ${slug}: ${value}`,
          );
        }
      } catch {
        errors.push(
          `redirects.json ${label} is not a valid URL for ${slug}: ${value}`,
        );
      }
    }
  }
}

for (const record of pricing) {
  if (!record?.provider_id) {
    errors.push(
      `pricing record missing provider_id: ${JSON.stringify(record)}`,
    );
    continue;
  }
  if (!providerIds.has(record.provider_id)) {
    errors.push(
      `pricing record references unknown provider_id: ${record.provider_id}`,
    );
  }

  const tiers = record.tiers ?? [];
  const tierCount = record.tier_count ?? 0;
  if (tierCount !== tiers.length) {
    errors.push(
      `tier_count mismatch for ${record.provider_id}/${record.proxy_type}: ${tierCount} != ${tiers.length}`,
    );
  }

  if (record.has_pricing === false) {
    if (tiers.length !== 0) {
      errors.push(
        `has_pricing=false but tiers not empty for ${record.provider_id}/${record.proxy_type}`,
      );
    }
    if (record.comparable === true) {
      errors.push(
        `has_pricing=false but comparable=true for ${record.provider_id}/${record.proxy_type}`,
      );
    }
  }

  if (record.comparable === true) {
    if (record.pricing_model !== "per_gb") {
      errors.push(
        `comparable=true but pricing_model!=per_gb for ${record.provider_id}/${record.proxy_type}`,
      );
    }
    if (record.min_price_per_gb == null || record.max_price_per_gb == null) {
      errors.push(
        `comparable=true but missing min/max $/GB for ${record.provider_id}/${record.proxy_type}`,
      );
    }
  }
}

if (errors.length) {
  console.error(`Data validation failed (${errors.length}):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log("✓ Data validation passed");
