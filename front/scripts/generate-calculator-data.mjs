import { readFile, writeFile } from "node:fs/promises";

const PRICING_PATH = new URL("../src/data/pricing.json", import.meta.url);
const PROVIDERS_PATH = new URL("../src/data/providers.json", import.meta.url);
const OUTPUT_PATH = new URL(
  "../src/data/calculator-data.json",
  import.meta.url,
);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

const pricingRaw = JSON.parse(await readFile(PRICING_PATH, "utf8"));
const providersRaw = JSON.parse(await readFile(PROVIDERS_PATH, "utf8"));

const providersById = new Map(
  providersRaw.providers.map((provider) => [provider.id, provider]),
);

const comparablePricing = [];
const fallbackPricing = [];

for (const record of pricingRaw.pricing) {
  const provider = providersById.get(record.provider_id);
  const providerName = record.provider_name || provider?.name || record.provider_id;
  const websiteUrl = provider?.website_url || "";

  const tiers = Array.isArray(record.tiers) ? record.tiers : [];

  if (record.comparable === true) {
    const perGbTiers = tiers
      .filter(
        (tier) =>
          tier && tier.pricing_model === "per_gb" && isFiniteNumber(tier.price_per_gb),
      )
      .map((tier) => ({
        ...(isFiniteNumber(tier.gb) ? { gb: tier.gb } : {}),
        price_per_gb: tier.price_per_gb,
        ...(tier.is_payg === true ? { is_payg: true } : {}),
      }));

    if (perGbTiers.length === 0) {
      continue;
    }

    comparablePricing.push({
      provider_id: record.provider_id,
      provider_name: providerName,
      website_url: websiteUrl,
      proxy_type: record.proxy_type,
      tiers: perGbTiers,
    });
    continue;
  }

  if (record.has_pricing === true) {
    fallbackPricing.push({
      provider_id: record.provider_id,
      provider_name: providerName,
      website_url: websiteUrl,
      proxy_type: record.proxy_type,
      pricing_model: record.pricing_model,
    });
  }
}

comparablePricing.sort(
  (a, b) =>
    a.proxy_type.localeCompare(b.proxy_type) ||
    a.provider_name.localeCompare(b.provider_name),
);

fallbackPricing.sort(
  (a, b) =>
    a.proxy_type.localeCompare(b.proxy_type) ||
    a.provider_name.localeCompare(b.provider_name),
);

const output = {
  source_last_updated: pricingRaw.last_updated,
  comparable_pricing: comparablePricing,
  fallback_pricing: fallbackPricing,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Generated calculator data (${comparablePricing.length} comparable, ${fallbackPricing.length} fallback).`,
);
