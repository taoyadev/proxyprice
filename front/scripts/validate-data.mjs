import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const providersPath = path.join(projectRoot, "src", "data", "providers.json");
const pricingPath = path.join(projectRoot, "src", "data", "pricing.json");
const redirectsPath = path.join(projectRoot, "src", "data", "redirects.json");
const merchantProfilesPath = path.join(
  projectRoot,
  "src",
  "data",
  "merchant-profiles.json",
);
const candidateExportPath = path.join(
  projectRoot,
  "public",
  "api",
  "v1",
  "export",
  "proxy-merchant-intel-candidates.json",
);

const providersData = JSON.parse(fs.readFileSync(providersPath, "utf-8"));
const pricingData = JSON.parse(fs.readFileSync(pricingPath, "utf-8"));
const redirectsData = fs.existsSync(redirectsPath)
  ? JSON.parse(fs.readFileSync(redirectsPath, "utf-8"))
  : null;
const merchantProfilesData = JSON.parse(
  fs.readFileSync(merchantProfilesPath, "utf-8"),
);
const candidateExportData = fs.existsSync(candidateExportPath)
  ? JSON.parse(fs.readFileSync(candidateExportPath, "utf-8"))
  : null;

/** @type {string[]} */
const errors = [];

const providers = providersData.providers ?? [];
const pricing = pricingData.pricing ?? [];
const redirects = redirectsData?.providers ?? null;
const merchantProfiles = merchantProfilesData?.profiles ?? null;
const forbiddenMerchantProfileKeys = new Set([
  "affiliate",
  "go_slug",
  "pretty_link",
  "preferred_tracking_url",
  "rank",
  "ranking",
  "site_rank",
  "sponsor",
  "sponsor_lock",
  "cta",
  "cta_copy",
  "publish_mode",
  "wordpress",
  "site_style",
  "target_domain",
  "url_override",
]);
const forbiddenCandidateExportKeys = new Set([
  "affiliate",
  "go_slug",
  "go_url",
  "publish_mode",
  "site_rank",
  "ranking",
  "sponsor",
  "cta",
  "notes",
]);

const isDateString = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function scanForbiddenProfileKeys(value, pathName) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenProfileKeys(item, `${pathName}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenMerchantProfileKeys.has(key)) {
      errors.push(`merchant-profiles.json contains forbidden key: ${pathName}.${key}`);
    }
    scanForbiddenProfileKeys(child, `${pathName}.${key}`);
  }
}

function scanForbiddenCandidateKeys(value, pathName) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenCandidateKeys(item, `${pathName}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenCandidateExportKeys.has(key)) {
      errors.push(
        `candidate export contains forbidden site field: ${pathName}.${key}`,
      );
    }
    scanForbiddenCandidateKeys(child, `${pathName}.${key}`);
  }
}

function validateOptionalDate(value, pathName) {
  if (value == null) return;
  if (!isDateString(value)) {
    errors.push(`${pathName} must be YYYY-MM-DD or null`);
  }
}

function validateOptionalUrl(value, pathName) {
  if (value == null) return;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      errors.push(`${pathName} has invalid protocol: ${value}`);
    }
  } catch {
    errors.push(`${pathName} is not a valid URL: ${value}`);
  }
}

function validateRequiredHttpsUrl(value, pathName) {
  if (typeof value !== "string" || !value) {
    errors.push(`${pathName} must be a non-empty HTTPS URL`);
    return;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") {
      errors.push(`${pathName} must use https: ${value}`);
    }
  } catch {
    errors.push(`${pathName} is not a valid URL: ${value}`);
  }
}

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

if (merchantProfilesData.schema_version !== "1.0.0") {
  errors.push("merchant-profiles.json schema_version must be 1.0.0");
}
if (merchantProfilesData.source !== "proxy-merchant-intel") {
  errors.push("merchant-profiles.json source must be proxy-merchant-intel");
}
if (!isDateString(merchantProfilesData.generated_at)) {
  errors.push("merchant-profiles.json generated_at must be YYYY-MM-DD");
}
if (merchantProfilesData.providers_last_updated !== providersData.last_updated) {
  errors.push("merchant-profiles.json providers_last_updated is stale");
}
if (merchantProfilesData.pricing_last_updated !== pricingData.last_updated) {
  errors.push("merchant-profiles.json pricing_last_updated is stale");
}

// ============================================================================
// PROXY-MERCHANT-INTEL CANDIDATE EXPORT VALIDATION
// ============================================================================

if (!candidateExportData) {
  errors.push(
    "missing public/api/v1/export/proxy-merchant-intel-candidates.json",
  );
} else {
  if (candidateExportData.schema_version !== "1.0.0") {
    errors.push("candidate export schema_version must be 1.0.0");
  }
  if (candidateExportData.api_version !== "v1") {
    errors.push("candidate export api_version must be v1");
  }
  if (candidateExportData.site_key !== "proxyprice") {
    errors.push("candidate export site_key must be proxyprice");
  }
  if (candidateExportData.export_type !== "proxy_merchant_intel_candidates") {
    errors.push(
      "candidate export export_type must be proxy_merchant_intel_candidates",
    );
  }
  if (candidateExportData.data_last_updated !== pricingData.last_updated) {
    errors.push("candidate export data_last_updated is stale");
  }
  if (!Array.isArray(candidateExportData.items)) {
    errors.push("candidate export items must be an array");
  } else if (candidateExportData.total_count !== candidateExportData.items.length) {
    errors.push(
      `candidate export total_count mismatch: ${candidateExportData.total_count} != ${candidateExportData.items.length}`,
    );
  }
  scanForbiddenCandidateKeys(candidateExportData.items || [], "candidate.items");
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

if (!merchantProfiles || typeof merchantProfiles !== "object") {
  errors.push("merchant-profiles.json is missing top-level 'profiles' object");
} else {
  scanForbiddenProfileKeys(merchantProfilesData, "merchant-profiles");
  const profileEntries = Object.entries(merchantProfiles);
  const displayableCount = profileEntries.filter(
    ([, profile]) => profile?.display_profile === true,
  ).length;

  if (merchantProfilesData.total_count !== profileEntries.length) {
    errors.push(
      `merchant-profiles.json total_count mismatch: ${merchantProfilesData.total_count} != ${profileEntries.length}`,
    );
  }
  if (merchantProfilesData.displayable_count !== displayableCount) {
    errors.push(
      `merchant-profiles.json displayable_count mismatch: ${merchantProfilesData.displayable_count} != ${displayableCount}`,
    );
  }

  for (const slug of providerIds) {
    if (!merchantProfiles[slug]) {
      errors.push(`merchant-profiles.json missing provider slug: ${slug}`);
    }
  }
  for (const [slug, profile] of profileEntries) {
    if (!providerIds.has(slug)) {
      errors.push(`merchant-profiles.json references unknown provider slug: ${slug}`);
      continue;
    }
    if (!profile || typeof profile !== "object") {
      errors.push(`merchant profile for ${slug} must be an object`);
      continue;
    }
    if (profile.provider_slug !== slug) {
      errors.push(`merchant profile provider_slug mismatch for ${slug}`);
    }
    if (typeof profile.provider_name !== "string" || !profile.provider_name) {
      errors.push(`merchant profile provider_name missing for ${slug}`);
    }
    if (typeof profile.display_profile !== "boolean") {
      errors.push(`merchant profile display_profile must be boolean for ${slug}`);
    }
    if (profile.merchant_key != null && typeof profile.merchant_key !== "string") {
      errors.push(`merchant profile merchant_key must be string or null for ${slug}`);
    }

    if (profile.display_profile === true) {
      if (!profile.merchant_key) {
        errors.push(`displayable merchant profile missing merchant_key for ${slug}`);
      }
      if (!profile.names?.display_name) {
        errors.push(`displayable merchant profile missing names.display_name for ${slug}`);
      }
      validateOptionalUrl(profile.official?.homepage_url, `${slug}.official.homepage_url`);
      validateOptionalUrl(profile.official?.pricing_url, `${slug}.official.pricing_url`);
      if (!Array.isArray(profile.products) || profile.products.length === 0) {
        errors.push(`displayable merchant profile missing products for ${slug}`);
      }
      for (const [index, product] of (profile.products || []).entries()) {
        if (!product.product_key) {
          errors.push(`merchant profile product missing product_key for ${slug}[${index}]`);
        }
        if (!product.pricing_model) {
          errors.push(`merchant profile product missing pricing_model for ${slug}[${index}]`);
        }
        validateOptionalUrl(product.source_url, `${slug}.products[${index}].source_url`);
        if (product.entry_price != null) {
          if (
            product.entry_price.amount != null &&
            (typeof product.entry_price.amount !== "number" || product.entry_price.amount < 0)
          ) {
            errors.push(`merchant profile product entry amount invalid for ${slug}[${index}]`);
          }
          validateOptionalUrl(
            product.entry_price.source_url,
            `${slug}.products[${index}].entry_price.source_url`,
          );
          validateOptionalDate(
            product.entry_price.observed_at,
            `${slug}.products[${index}].entry_price.observed_at`,
          );
        }
      }
      const pages = profile.evidence?.official_pages || [];
      if (!Array.isArray(pages) || pages.length === 0) {
        errors.push(`displayable merchant profile missing official evidence for ${slug}`);
      }
      for (const [index, page] of pages.entries()) {
        if (!page.label) {
          errors.push(`merchant evidence missing label for ${slug}[${index}]`);
        }
        validateOptionalUrl(page.url, `${slug}.evidence[${index}].url`);
        validateOptionalDate(page.observed_at, `${slug}.evidence[${index}].observed_at`);
      }
    }
  }
}

if (candidateExportData?.items) {
  const seenCandidateMerchants = new Set();
  for (const [index, item] of candidateExportData.items.entries()) {
    const pathName = `candidate.items[${index}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${pathName} must be an object`);
      continue;
    }

    if (!item.merchant_key) {
      errors.push(`${pathName}.merchant_key is required`);
    }
    if (!item.provider_slug || !providerIds.has(item.provider_slug)) {
      errors.push(`${pathName}.provider_slug references unknown provider`);
    }
    const profile = merchantProfiles?.[item.provider_slug];
    if (!profile || profile.display_profile !== true) {
      errors.push(`${pathName}.provider_slug does not map to a displayable merchant profile`);
    }
    if (profile?.merchant_key && item.merchant_key !== profile.merchant_key) {
      errors.push(`${pathName}.merchant_key does not match merchant profile`);
    }
    if (seenCandidateMerchants.has(item.merchant_key)) {
      errors.push(`${pathName}.merchant_key is duplicated: ${item.merchant_key}`);
    }
    seenCandidateMerchants.add(item.merchant_key);

    if (!item.display_name) {
      errors.push(`${pathName}.display_name is required`);
    }
    validateRequiredHttpsUrl(item.homepage_url, `${pathName}.homepage_url`);
    validateRequiredHttpsUrl(item.official_pages?.homepage, `${pathName}.official_pages.homepage`);
    validateRequiredHttpsUrl(item.official_pages?.pricing, `${pathName}.official_pages.pricing`);

    if (item.writeback_status !== "candidate") {
      errors.push(`${pathName}.writeback_status must be candidate`);
    }

    if (!Array.isArray(item.pricing_evidence) || item.pricing_evidence.length === 0) {
      errors.push(`${pathName}.pricing_evidence must be a non-empty array`);
      continue;
    }

    for (const [evidenceIndex, evidence] of item.pricing_evidence.entries()) {
      const evidencePath = `${pathName}.pricing_evidence[${evidenceIndex}]`;
      if (!evidence.product_key) {
        errors.push(`${evidencePath}.product_key is required`);
      }
      if (!["residential", "datacenter", "mobile", "isp"].includes(evidence.proxy_type)) {
        errors.push(`${evidencePath}.proxy_type is invalid`);
      }
      if (evidence.pricing_model !== "per_gb") {
        errors.push(`${evidencePath}.pricing_model must be per_gb`);
      }
      if (evidence.normalized_unit !== "gb") {
        errors.push(`${evidencePath}.normalized_unit must be gb`);
      }
      if (evidence.comparable !== true) {
        errors.push(`${evidencePath}.comparable must be true`);
      }
      if (
        typeof evidence.min_price_usd_per_gb !== "number" ||
        evidence.min_price_usd_per_gb < 0
      ) {
        errors.push(`${evidencePath}.min_price_usd_per_gb must be a non-negative number`);
      }
      if (
        typeof evidence.max_price_usd_per_gb !== "number" ||
        evidence.max_price_usd_per_gb < 0
      ) {
        errors.push(`${evidencePath}.max_price_usd_per_gb must be a non-negative number`);
      }
      if (
        typeof evidence.min_price_usd_per_gb === "number" &&
        typeof evidence.max_price_usd_per_gb === "number" &&
        evidence.min_price_usd_per_gb > evidence.max_price_usd_per_gb
      ) {
        errors.push(`${evidencePath}.min_price_usd_per_gb cannot exceed max_price_usd_per_gb`);
      }
      if (!Number.isInteger(evidence.tier_count) || evidence.tier_count < 0) {
        errors.push(`${evidencePath}.tier_count must be a non-negative integer`);
      }
      validateRequiredHttpsUrl(evidence.source_url, `${evidencePath}.source_url`);
      validateOptionalDate(evidence.observed_at, `${evidencePath}.observed_at`);
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
