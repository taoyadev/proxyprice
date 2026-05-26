import crypto from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const SITE_KEY = "proxyprice";
const API_VERSION = "v1";
const SCHEMA_VERSION = "1.0.0";
const MERCHANT_INTEL_PROXY_TYPES = new Set([
  "residential",
  "isp",
  "datacenter",
  "mobile",
  "static-residential",
]);
const MERCHANT_INTEL_PRICING_MODELS = new Set([
  "per_gb",
  "per_ip",
  "per_port",
  "per_request",
  "monthly_subscription",
  "quote_based",
]);

const PROVIDERS_PATH = new URL("../src/data/providers.json", import.meta.url);
const PRICING_PATH = new URL("../src/data/pricing.json", import.meta.url);
const REDIRECTS_PATH = new URL("../src/data/redirects.json", import.meta.url);
const OVERLAY_PATH = new URL("../../data/site-overlays/proxyprice.json", import.meta.url);
const OUTPUT_ROOT = new URL("../public/api/v1/", import.meta.url);

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceHash(parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(stableStringify(part));
  }
  return hash.digest("hex");
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function writeJson(relativePath, value) {
  const target = new URL(relativePath, OUTPUT_ROOT);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function toIsoTimestamp() {
  return new Date().toISOString();
}

function normalizedUnitFor(record) {
  if (record.pricing_model === "per_gb") return "gb";
  if (record.pricing_model === "per_ip") return "ip";
  if (record.pricing_model === "per_thread") return "thread";
  return null;
}

function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function publicProvider(provider, overlayEntry, pricingRows) {
  const priceUrls = Array.from(
    new Set(
      pricingRows
        .map((record) => record.price_url)
        .filter((url) => typeof url === "string" && url.length > 0),
    ),
  ).sort();

  const goSlug = overlayEntry?.go_slug ?? provider.slug ?? provider.id;

  return {
    provider_slug: provider.slug ?? provider.id,
    provider_id: provider.id,
    merchant_key: overlayEntry?.merchant_key ?? null,
    name: provider.name,
    website_url: provider.website_url,
    proxy_types: provider.proxy_types ?? [],
    trial_offer: provider.trial_offer ?? null,
    cheapest_price_per_gb: numericOrNull(provider.cheapest_price_per_gb),
    has_pricing_data: provider.has_pricing_data === true,
    pricing_count: provider.pricing_count ?? pricingRows.length,
    include: overlayEntry?.include !== false,
    go_slug: goSlug,
    go_url: `/go/${goSlug}/`,
    detail_url: `/provider/${provider.slug ?? provider.id}/`,
    api_url: `/api/v1/providers/${provider.slug ?? provider.id}.json`,
    price_urls: priceUrls,
  };
}

function publicPricingRecord(record, provider, overlayEntry, dataLastUpdated) {
  const pricingModel = record.pricing_model ?? "unknown";
  return {
    provider_slug: record.provider_id,
    provider_id: record.provider_id,
    provider_name: record.provider_name ?? provider?.name ?? record.provider_id,
    merchant_key: overlayEntry?.merchant_key ?? null,
    proxy_type: record.proxy_type,
    pricing_model: pricingModel,
    normalized_unit: normalizedUnitFor(record),
    comparable: record.comparable === true,
    has_pricing: record.has_pricing === true,
    min_price_per_gb: numericOrNull(record.min_price_per_gb),
    max_price_per_gb: numericOrNull(record.max_price_per_gb),
    tier_count: record.tier_count ?? (Array.isArray(record.tiers) ? record.tiers.length : 0),
    tiers: Array.isArray(record.tiers) ? record.tiers : [],
    source_url: record.price_url ?? null,
    observed_at: dataLastUpdated,
  };
}

function cheapestItems(pricingItems, providersBySlug, proxyType = null) {
  return pricingItems
    .filter((record) => record.comparable && record.min_price_per_gb != null)
    .filter((record) => !proxyType || record.proxy_type === proxyType)
    .slice()
    .sort(
      (a, b) =>
        a.min_price_per_gb - b.min_price_per_gb ||
        a.provider_name.localeCompare(b.provider_name) ||
        a.proxy_type.localeCompare(b.proxy_type),
    )
    .map((record, index) => {
      const provider = providersBySlug.get(record.provider_slug);
      return {
        rank: index + 1,
        provider_slug: record.provider_slug,
        provider_name: record.provider_name,
        merchant_key: record.merchant_key,
        proxy_type: record.proxy_type,
        min_price_per_gb: record.min_price_per_gb,
        max_price_per_gb: record.max_price_per_gb,
        source_url: record.source_url,
        observed_at: record.observed_at,
        detail_url: provider?.detail_url ?? `/provider/${record.provider_slug}/`,
        go_url: provider?.go_url ?? `/go/${record.provider_slug}/`,
      };
    });
}

function candidateEvidence(record) {
  if (!MERCHANT_INTEL_PROXY_TYPES.has(record.proxy_type)) return null;
  if (!MERCHANT_INTEL_PRICING_MODELS.has(record.pricing_model)) return null;

  return {
    product_key: `${record.proxy_type}-proxies`,
    proxy_type: record.proxy_type,
    pricing_model: record.pricing_model,
    normalized_unit: record.normalized_unit,
    comparable: record.comparable,
    min_price_usd_per_gb: record.comparable ? record.min_price_per_gb : null,
    max_price_usd_per_gb: record.comparable ? record.max_price_per_gb : null,
    tier_count: record.tier_count,
    source_url: record.source_url,
    observed_at: record.observed_at,
  };
}

function merchantCandidates(providers, pricingItems) {
  const candidatesByMerchant = new Map();

  for (const provider of providers) {
    if (!provider.merchant_key || !provider.include) continue;

    const evidence = pricingItems
      .filter((record) => record.provider_slug === provider.provider_slug)
      .filter((record) => record.source_url)
      .filter((record) => record.has_pricing || record.comparable)
      .map(candidateEvidence)
      .filter((evidence) => evidence !== null);

    if (evidence.length === 0) continue;

    candidatesByMerchant.set(provider.merchant_key, {
      merchant_key: provider.merchant_key,
      provider_slug: provider.provider_slug,
      display_name: provider.name,
      homepage_url: provider.website_url,
      official_pages: {
        homepage: provider.website_url,
        pricing: evidence[0]?.source_url ?? null,
      },
      pricing_evidence: evidence,
      writeback_status: "candidate",
    });
  }

  return Array.from(candidatesByMerchant.values()).sort((a, b) =>
    a.merchant_key.localeCompare(b.merchant_key),
  );
}

function envelope({ generatedAt, dataLastUpdated, hash, body }) {
  return {
    schema_version: SCHEMA_VERSION,
    api_version: API_VERSION,
    site_key: SITE_KEY,
    data_last_updated: dataLastUpdated,
    generated_at: generatedAt,
    source_hash: hash,
    ...body,
  };
}

const providersRaw = await readJson(PROVIDERS_PATH);
const pricingRaw = await readJson(PRICING_PATH);
const redirectsRaw = await readJson(REDIRECTS_PATH);
const overlayRaw = await readJson(OVERLAY_PATH);

const generatedAt = toIsoTimestamp();
const dataLastUpdated = pricingRaw.last_updated ?? providersRaw.last_updated;
const hash = sourceHash([providersRaw, pricingRaw, redirectsRaw, overlayRaw]);

const rawProviders = providersRaw.providers ?? [];
const rawPricing = pricingRaw.pricing ?? [];
const overlayProviders = overlayRaw.providers ?? {};
const pricingByProvider = new Map();
for (const record of rawPricing) {
  const slug = record.provider_id;
  pricingByProvider.set(slug, [...(pricingByProvider.get(slug) ?? []), record]);
}

const providers = rawProviders
  .map((provider) =>
    publicProvider(provider, overlayProviders[provider.slug ?? provider.id], pricingByProvider.get(provider.id) ?? []),
  )
  .filter((provider) => provider.include);

const providersBySlug = new Map(providers.map((provider) => [provider.provider_slug, provider]));

const pricing = rawPricing
  .map((record) =>
    publicPricingRecord(
      record,
      providersBySlug.get(record.provider_id),
      overlayProviders[record.provider_id],
      dataLastUpdated,
    ),
  )
  .filter((record) => providersBySlug.has(record.provider_slug));

const proxyTypes = Array.from(new Set(pricing.map((record) => record.proxy_type))).sort();
const comparableCount = pricing.filter((record) => record.comparable).length;
const nonComparableCount = pricing.filter((record) => record.has_pricing && !record.comparable).length;
const missingPriceCount = pricing.filter((record) => !record.has_pricing).length;
const providersMissingMerchantKey = providers
  .filter((provider) => !provider.merchant_key)
  .map((provider) => provider.provider_slug)
  .sort();
const missingSourceUrl = pricing
  .filter((record) => record.has_pricing && !record.source_url)
  .map((record) => `${record.provider_slug}/${record.proxy_type}`)
  .sort();
const candidates = merchantCandidates(providers, pricing);

const common = { generatedAt, dataLastUpdated, hash };

await rm(OUTPUT_ROOT, { recursive: true, force: true });
await mkdir(OUTPUT_ROOT, { recursive: true });

await writeJson(
  "manifest.json",
  envelope({
    ...common,
    body: {
      endpoints: {
        manifest: "/api/v1/manifest.json",
        providers: "/api/v1/providers.json",
        pricing: "/api/v1/pricing.json",
        cheapest: "/api/v1/cheapest.json",
        source_status: "/api/v1/source-status.json",
        proxy_merchant_intel_candidates:
          "/api/v1/export/proxy-merchant-intel-candidates.json",
      },
      counts: {
        providers: providers.length,
        pricing_records: pricing.length,
        comparable_pricing_records: comparableCount,
        non_comparable_pricing_records: nonComparableCount,
        missing_price_records: missingPriceCount,
        proxy_merchant_intel_candidates: candidates.length,
      },
    },
  }),
);

await writeJson(
  "providers.json",
  envelope({
    ...common,
    body: {
      total_count: providers.length,
      items: providers,
    },
  }),
);

await writeJson(
  "pricing.json",
  envelope({
    ...common,
    body: {
      total_count: pricing.length,
      items: pricing,
    },
  }),
);

await writeJson(
  "cheapest.json",
  envelope({
    ...common,
    body: {
      note: "Static snapshot. Query parameters are client-side filters in v1; use by_proxy_type or filter items.",
      total_count: cheapestItems(pricing, providersBySlug).length,
      items: cheapestItems(pricing, providersBySlug),
      by_proxy_type: Object.fromEntries(
        proxyTypes.map((proxyType) => [
          proxyType,
          cheapestItems(pricing, providersBySlug, proxyType),
        ]),
      ),
    },
  }),
);

await writeJson(
  "source-status.json",
  envelope({
    ...common,
    body: {
      providers_reviewed: providers.length,
      pricing_records_reviewed: pricing.length,
      comparable_pricing_records: comparableCount,
      non_comparable_pricing_records: nonComparableCount,
      missing_price_records: missingPriceCount,
      providers_missing_merchant_key: providersMissingMerchantKey,
      pricing_records_missing_source_url: missingSourceUrl,
      proxy_types: proxyTypes,
      public_api_surface: "read_only_static_snapshot",
    },
  }),
);

await writeJson(
  "export/proxy-merchant-intel-candidates.json",
  envelope({
    ...common,
    body: {
      export_type: "proxy_merchant_intel_candidates",
      writeback_policy: "candidate_only_validate_before_global_write",
      forbidden_fields_excluded: [
        "affiliate",
        "go_slug",
        "publish_mode",
        "site_rank",
        "sponsor",
        "cta",
      ],
      total_count: candidates.length,
      items: candidates,
    },
  }),
);

for (const provider of providers) {
  const providerPricing = pricing.filter(
    (record) => record.provider_slug === provider.provider_slug,
  );
  await writeJson(
    `providers/${provider.provider_slug}.json`,
    envelope({
      ...common,
      body: {
        item: provider,
        pricing: providerPricing,
      },
    }),
  );
}

console.log(
  `Generated API ${API_VERSION} (${providers.length} providers, ${pricing.length} pricing records, ${candidates.length} candidates).`,
);
