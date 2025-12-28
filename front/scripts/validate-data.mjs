import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const providersPath = path.join(projectRoot, "src", "data", "providers.json");
const pricingPath = path.join(projectRoot, "src", "data", "pricing.json");

const providersData = JSON.parse(fs.readFileSync(providersPath, "utf-8"));
const pricingData = JSON.parse(fs.readFileSync(pricingPath, "utf-8"));

/** @type {string[]} */
const errors = [];

const providers = providersData.providers ?? [];
const pricing = pricingData.pricing ?? [];

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
