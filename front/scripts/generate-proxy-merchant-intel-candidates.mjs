import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, "src", "data");
const outputPath = path.join(
  projectRoot,
  "public",
  "api",
  "v1",
  "export",
  "proxy-merchant-intel-candidates.json",
);

const proxyTypeOrder = ["residential", "datacenter", "mobile", "isp"];
const proxyTypeRank = new Map(proxyTypeOrder.map((type, index) => [type, index]));
const forbiddenFieldsExcluded = [
  "affiliate",
  "go_slug",
  "publish_mode",
  "site_rank",
  "sponsor",
  "cta",
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const providersData = readJson(path.join(dataDir, "providers.json"));
const pricingData = readJson(path.join(dataDir, "pricing.json"));
const merchantProfilesData = readJson(path.join(dataDir, "merchant-profiles.json"));

if (
  merchantProfilesData.providers_last_updated !== providersData.last_updated ||
  merchantProfilesData.pricing_last_updated !== pricingData.last_updated
) {
  throw new Error(
    [
      "merchant-profiles.json is stale; regenerate it before exporting candidates.",
      `providers=${providersData.last_updated}`,
      `pricing=${pricingData.last_updated}`,
      `profiles.providers=${merchantProfilesData.providers_last_updated}`,
      `profiles.pricing=${merchantProfilesData.pricing_last_updated}`,
    ].join(" "),
  );
}

const providersBySlug = new Map(
  (providersData.providers || []).map((provider) => [provider.slug, provider]),
);
const pricingByProvider = new Map();

for (const record of pricingData.pricing || []) {
  if (!pricingByProvider.has(record.provider_id)) {
    pricingByProvider.set(record.provider_id, []);
  }
  pricingByProvider.get(record.provider_id).push(record);
}

const isHttpsUrl = (value) => {
  if (typeof value !== "string" || !value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const sourceUrlFor = (profile, record, product) => {
  const candidates = [
    record.price_url,
    product?.entry_price?.source_url,
    product?.source_url,
    profile.official?.pricing_url,
  ];
  return candidates.find(isHttpsUrl) || null;
};

const productForRecord = (profile, record) => {
  const products = Array.isArray(profile.products) ? profile.products : [];
  return (
    products.find(
      (product) =>
        product.proxy_type === record.proxy_type &&
        product.pricing_model === "per_gb" &&
        sourceUrlFor(profile, record, product),
    ) ||
    products.find(
      (product) =>
        product.proxy_type === record.proxy_type &&
        sourceUrlFor(profile, record, product),
    ) ||
    null
  );
};

const buildPricingEvidence = (profile, record) => {
  if (
    !proxyTypeRank.has(record.proxy_type) ||
    record.comparable !== true ||
    record.pricing_model !== "per_gb" ||
    typeof record.min_price_per_gb !== "number" ||
    typeof record.max_price_per_gb !== "number"
  ) {
    return null;
  }

  const product = productForRecord(profile, record);
  const sourceUrl = sourceUrlFor(profile, record, product);
  if (!sourceUrl) return null;

  return {
    product_key: product?.product_key || `${record.proxy_type}-proxies`,
    proxy_type: record.proxy_type,
    pricing_model: "per_gb",
    normalized_unit: "gb",
    comparable: true,
    min_price_usd_per_gb: record.min_price_per_gb,
    max_price_usd_per_gb: record.max_price_per_gb,
    tier_count: record.tier_count ?? 0,
    source_url: sourceUrl,
    observed_at: pricingData.last_updated,
  };
};

const buildItem = ([providerSlug, profile]) => {
  const provider = providersBySlug.get(providerSlug);
  if (!provider || profile?.display_profile !== true || !profile.merchant_key) {
    return null;
  }

  const homepageUrl = profile.official?.homepage_url;
  const pricingUrl = profile.official?.pricing_url;
  if (!isHttpsUrl(homepageUrl) || !isHttpsUrl(pricingUrl)) {
    return null;
  }

  const evidenceByKey = new Map();
  for (const record of pricingByProvider.get(providerSlug) || []) {
    const evidence = buildPricingEvidence(profile, record);
    if (!evidence) continue;

    const key = `${evidence.proxy_type}:${evidence.product_key}:${evidence.source_url}`;
    const existing = evidenceByKey.get(key);
    if (
      !existing ||
      evidence.min_price_usd_per_gb < existing.min_price_usd_per_gb ||
      evidence.observed_at > existing.observed_at
    ) {
      evidenceByKey.set(key, evidence);
    }
  }

  const pricingEvidence = Array.from(evidenceByKey.values()).sort((a, b) => {
    const typeDiff = proxyTypeRank.get(a.proxy_type) - proxyTypeRank.get(b.proxy_type);
    if (typeDiff !== 0) return typeDiff;
    return a.product_key.localeCompare(b.product_key);
  });

  if (pricingEvidence.length === 0) return null;

  return {
    merchant_key: profile.merchant_key,
    provider_slug: providerSlug,
    display_name: profile.names?.display_name || provider.name,
    homepage_url: homepageUrl,
    official_pages: {
      homepage: homepageUrl,
      pricing: pricingUrl,
    },
    pricing_evidence: pricingEvidence,
    writeback_status: "candidate",
  };
};

const items = Object.entries(merchantProfilesData.profiles || {})
  .map(buildItem)
  .filter(Boolean)
  .sort((a, b) => a.merchant_key.localeCompare(b.merchant_key));

const sourceHash = crypto
  .createHash("sha256")
  .update(
    JSON.stringify({
      data_last_updated: pricingData.last_updated,
      items,
    }),
  )
  .digest("hex");

const payload = {
  schema_version: "1.0.0",
  api_version: "v1",
  site_key: "proxyprice",
  data_last_updated: pricingData.last_updated,
  generated_at: `${pricingData.last_updated}T00:00:00.000Z`,
  source_hash: sourceHash,
  export_type: "proxy_merchant_intel_candidates",
  writeback_policy: "candidate_only_validate_before_global_write",
  forbidden_fields_excluded: forbiddenFieldsExcluded,
  total_count: items.length,
  items,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  `Generated proxy-merchant-intel candidate export: ${path.relative(
    projectRoot,
    outputPath,
  )} (${items.length} items)`,
);
