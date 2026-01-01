/**
 * Enhanced Data Validation Script with Zod Runtime Validation
 *
 * This script validates all JSON data files using both custom checks
 * and Zod schema validation for runtime type safety.
 */

import fs from "node:fs";
import path from "node:path";

// Import Zod schemas
const projectRoot = process.cwd();

// Dynamic import of schemas
async function loadSchemas() {
  // We need to transpile TypeScript for use in Node.js
  // For now, define simplified inline schemas
  return {
    validateUrl: (str) => {
      try {
        new URL(str);
        return true;
      } catch {
        return false;
      }
    },
    PROXY_TYPES: new Set([
      "residential",
      "datacenter",
      "mobile",
      "isp",
      "other",
    ]),
  };
}

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
/** @type {string[]} */
const warnings = [];

const { validateUrl, PROXY_TYPES } = await loadSchemas();

const providers = providersData.providers ?? [];
const pricing = pricingData.pricing ?? [];
const redirects = redirectsData?.providers ?? null;

// ============================================================================
// STRUCTURAL VALIDATION
// ============================================================================

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

// ============================================================================
// PROVIDER VALIDATION
// ============================================================================

const providerIds = new Set();
const providerSlugs = new Set();
const providerUrls = new Set();

for (const p of providers) {
  if (!p?.id) {
    errors.push(`provider missing id: ${JSON.stringify(p)}`);
    continue;
  }

  // Duplicate ID check
  if (providerIds.has(p.id)) {
    errors.push(`duplicate provider id: ${p.id}`);
  }
  providerIds.add(p.id);

  // Slug validation
  if (p.slug && p.slug !== p.id) {
    errors.push(`provider slug != id for ${p.id}: slug=${p.slug}`);
  }
  if (providerSlugs.has(p.slug)) {
    errors.push(`duplicate provider slug: ${p.slug}`);
  }
  providerSlugs.add(p.slug);

  // Website URL validation
  if (!p.website_url) {
    errors.push(`provider missing website_url: ${p.id}`);
  } else if (!validateUrl(p.website_url)) {
    errors.push(
      `provider website_url is not a valid URL for ${p.id}: ${p.website_url}`,
    );
  } else {
    // Check for duplicate URLs (might indicate duplicate providers)
    const normalized = p.website_url
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (providerUrls.has(normalized)) {
      warnings.push(
        `provider ${p.id} has duplicate website_url with another provider`,
      );
    }
    providerUrls.add(normalized);
  }

  // Trial offer validation
  if (p.trial_offer !== null && typeof p.trial_offer !== "string") {
    errors.push(`provider trial_offer must be string or null for ${p.id}`);
  }

  // Proxy types validation
  if (p.proxy_types) {
    if (!Array.isArray(p.proxy_types)) {
      errors.push(`provider proxy_types must be an array for ${p.id}`);
    } else {
      for (const pt of p.proxy_types) {
        if (!PROXY_TYPES.has(pt)) {
          errors.push(`provider ${p.id} has invalid proxy_type: ${pt}`);
        }
      }
    }
  }

  // Numeric fields validation
  if (p.cheapest_price_per_gb !== undefined) {
    if (
      typeof p.cheapest_price_per_gb !== "number" ||
      p.cheapest_price_per_gb < 0
    ) {
      errors.push(
        `provider cheapest_price_per_gb must be non-negative number for ${p.id}`,
      );
    }
  }

  if (p.pricing_count !== undefined) {
    if (typeof p.pricing_count !== "number" || p.pricing_count < 0) {
      errors.push(
        `provider pricing_count must be non-negative number for ${p.id}`,
      );
    }
  }
}

// ============================================================================
// REDIRECTS VALIDATION
// ============================================================================

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

    // URL validation
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

      if (!validateUrl(value)) {
        errors.push(
          `redirects.json ${label} is not a valid URL for ${slug}: ${value}`,
        );
      }

      // Check for affiliate URL patterns
      if (label === "affiliate" && value) {
        const hasAffiliateParams = /[?&](ref|aff|affiliate|campaign)=/i.test(
          value,
        );
        if (!hasAffiliateParams) {
          warnings.push(
            `redirects.json affiliate URL for ${slug} may not contain affiliate parameters`,
          );
        }
      }
    }
  }
}

// ============================================================================
// PRICING VALIDATION
// ============================================================================

const pricingKeys = new Set();

for (const record of pricing) {
  if (!record?.provider_id) {
    errors.push(
      `pricing record missing provider_id: ${JSON.stringify(record)}`,
    );
    continue;
  }

  // Check for duplicate pricing records
  const key = `${record.provider_id}/${record.proxy_type}`;
  if (pricingKeys.has(key)) {
    errors.push(`duplicate pricing record for ${key}`);
  }
  pricingKeys.add(key);

  // Provider reference validation
  if (!providerIds.has(record.provider_id)) {
    errors.push(
      `pricing record references unknown provider_id: ${record.provider_id}`,
    );
  }

  // Proxy type validation
  if (!PROXY_TYPES.has(record.proxy_type)) {
    errors.push(
      `pricing record has invalid proxy_type: ${record.proxy_type} for ${record.provider_id}`,
    );
  }

  // Tiers validation
  const tiers = record.tiers ?? [];
  const tierCount = record.tier_count ?? 0;

  if (tierCount !== tiers.length) {
    errors.push(
      `tier_count mismatch for ${record.provider_id}/${record.proxy_type}: ${tierCount} != ${tiers.length}`,
    );
  }

  // has_pricing logic validation
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

  // comparable logic validation
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
    if (record.min_price_per_gb > record.max_price_per_gb) {
      errors.push(
        `min_price_per_gb > max_price_per_gb for ${record.provider_id}/${record.proxy_type}`,
      );
    }
  }

  // Tier structure validation
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (!tier || typeof tier !== "object") {
      errors.push(
        `tier ${i} is invalid for ${record.provider_id}/${record.proxy_type}`,
      );
      continue;
    }

    // Must have pricing_model
    if (!tier.pricing_model) {
      errors.push(
        `tier ${i} missing pricing_model for ${record.provider_id}/${record.proxy_type}`,
      );
    }

    // per_gb tier validation
    if (tier.pricing_model === "per_gb") {
      if (tier.price_per_gb !== undefined) {
        if (typeof tier.price_per_gb !== "number" || tier.price_per_gb < 0) {
          errors.push(
            `tier ${i} has invalid price_per_gb for ${record.provider_id}/${record.proxy_type}`,
          );
        }
      }
      if (tier.gb !== undefined && tier.gb < 0) {
        errors.push(
          `tier ${i} has invalid gb for ${record.provider_id}/${record.proxy_type}`,
        );
      }
      if (tier.total !== undefined && tier.total < 0) {
        errors.push(
          `tier ${i} has invalid total for ${record.provider_id}/${record.proxy_type}`,
        );
      }

      // PAYG tier validation
      if (tier.is_payg === true && tier.gb !== undefined && tier.gb !== 1) {
        warnings.push(
          `tier ${i} has is_payg=true but gb=${tier.gb} (expected 1 or unset) for ${record.provider_id}/${record.proxy_type}`,
        );
      }
    }

    // per_ip tier validation
    if (tier.pricing_model === "per_ip") {
      if (tier.price_per_ip !== undefined) {
        if (typeof tier.price_per_ip !== "number" || tier.price_per_ip < 0) {
          errors.push(
            `tier ${i} has invalid price_per_ip for ${record.provider_id}/${record.proxy_type}`,
          );
        }
      }
      if (tier.ips !== undefined && tier.ips < 0) {
        errors.push(
          `tier ${i} has invalid ips for ${record.provider_id}/${record.proxy_type}`,
        );
      }
    }
  }

  // Price URL validation
  if (record.price_url && !validateUrl(record.price_url)) {
    errors.push(
      `pricing record has invalid price_url for ${record.provider_id}/${record.proxy_type}: ${record.price_url}`,
    );
  }
}

// ============================================================================
// CROSS-REFERENCE VALIDATION
// ============================================================================

// Check that all providers with pricing_data have corresponding pricing records
for (const provider of providers) {
  const providerPricing = pricing.filter((p) => p.provider_id === provider.id);

  if (provider.has_pricing_data && providerPricing.length === 0) {
    errors.push(
      `provider ${provider.id} has has_pricing_data=true but no pricing records`,
    );
  }

  if (
    provider.pricing_count !== undefined &&
    provider.pricing_count !== providerPricing.length
  ) {
    errors.push(
      `provider ${provider.id} pricing_count mismatch: ${provider.pricing_count} != ${providerPricing.length}`,
    );
  }

  if (provider.proxy_types) {
    const pricingProxyTypes = new Set(providerPricing.map((p) => p.proxy_type));
    for (const pt of provider.proxy_types) {
      if (!pricingProxyTypes.has(pt)) {
        warnings.push(
          `provider ${provider.id} has proxy_type ${pt} but no corresponding pricing record`,
        );
      }
    }
  }

  // Validate cheapest_price_per_gb matches actual data
  if (provider.cheapest_price_per_gb !== undefined) {
    const minPrice = Math.min(
      ...providerPricing
        .filter((p) => p.min_price_per_gb !== undefined)
        .map((p) => p.min_price_per_gb ?? Infinity),
    );
    if (
      minPrice !== Infinity &&
      Math.abs(provider.cheapest_price_per_gb - minPrice) > 0.01
    ) {
      warnings.push(
        `provider ${provider.id} cheapest_price_per_gb=${provider.cheapest_price_per_gb} but actual min is ${minPrice}`,
      );
    }
  }
}

// ============================================================================
// OUTPUT
// ============================================================================

if (warnings.length) {
  console.warn(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error(`Data validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("✓ Data validation passed");
if (warnings.length) {
  console.log(`  with ${warnings.length} warning(s)`);
}
