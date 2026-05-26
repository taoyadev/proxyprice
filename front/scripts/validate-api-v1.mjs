import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const API_ROOT = new URL("../public/api/v1/", import.meta.url);
const PROVIDERS_SOURCE = new URL("../src/data/providers.json", import.meta.url);
const PRICING_SOURCE = new URL("../src/data/pricing.json", import.meta.url);
const REDIRECTS_SOURCE = new URL("../src/data/redirects.json", import.meta.url);

const REQUIRED_FILES = [
  "manifest.json",
  "providers.json",
  "pricing.json",
  "cheapest.json",
  "source-status.json",
  "export/proxy-merchant-intel-candidates.json",
];

const FORBIDDEN_CANDIDATE_KEYS = new Set([
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

const errors = [];
const warnings = [];

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function isUrlOrNull(value) {
  if (value === null) return true;
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  const url = new URL(relativePath, API_ROOT);
  return JSON.parse(await readFile(url, "utf8"));
}

async function readSourceJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function validateEnvelope(name, data, sourceHash) {
  for (const key of [
    "schema_version",
    "api_version",
    "site_key",
    "data_last_updated",
    "generated_at",
    "source_hash",
  ]) {
    if (!(key in data)) errors.push(`${name} missing envelope field: ${key}`);
  }
  if (data.schema_version !== "1.0.0") errors.push(`${name} schema_version must be 1.0.0`);
  if (data.api_version !== "v1") errors.push(`${name} api_version must be v1`);
  if (data.site_key !== "proxyprice") errors.push(`${name} site_key must be proxyprice`);
  if (!isIsoDate(data.data_last_updated)) {
    errors.push(`${name} data_last_updated must be YYYY-MM-DD`);
  }
  if (!isIsoTimestamp(data.generated_at)) {
    errors.push(`${name} generated_at must be an ISO timestamp`);
  }
  if (typeof data.source_hash !== "string" || data.source_hash.length !== 64) {
    errors.push(`${name} source_hash must be a sha256 hex digest`);
  }
  if (sourceHash && data.source_hash !== sourceHash) {
    errors.push(`${name} source_hash differs from manifest`);
  }
}

function findForbiddenKeys(value, path = "$") {
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...findForbiddenKeys(item, `${path}[${index}]`)));
    return hits;
  }
  if (!value || typeof value !== "object") return hits;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CANDIDATE_KEYS.has(key)) hits.push(`${path}.${key}`);
    hits.push(...findForbiddenKeys(nested, `${path}.${key}`));
  }
  return hits;
}

for (const file of REQUIRED_FILES) {
  try {
    await access(new URL(file, API_ROOT), constants.R_OK);
  } catch {
    errors.push(`missing API file: ${file}`);
  }
}

const manifest = await readJson("manifest.json");
validateEnvelope("manifest.json", manifest);
const manifestHash = manifest.source_hash;

const providersApi = await readJson("providers.json");
const pricingApi = await readJson("pricing.json");
const cheapestApi = await readJson("cheapest.json");
const sourceStatusApi = await readJson("source-status.json");
const candidatesApi = await readJson("export/proxy-merchant-intel-candidates.json");

for (const [name, data] of [
  ["providers.json", providersApi],
  ["pricing.json", pricingApi],
  ["cheapest.json", cheapestApi],
  ["source-status.json", sourceStatusApi],
  ["proxy-merchant-intel-candidates.json", candidatesApi],
]) {
  validateEnvelope(name, data, manifestHash);
}

const providersSource = await readSourceJson(PROVIDERS_SOURCE);
const pricingSource = await readSourceJson(PRICING_SOURCE);
const redirectsSource = await readSourceJson(REDIRECTS_SOURCE);

if (providersApi.total_count !== providersSource.providers.length) {
  errors.push(
    `providers API count mismatch: ${providersApi.total_count} != ${providersSource.providers.length}`,
  );
}
if (pricingApi.total_count !== pricingSource.pricing.length) {
  errors.push(
    `pricing API count mismatch: ${pricingApi.total_count} != ${pricingSource.pricing.length}`,
  );
}

const providerSlugs = new Set();
for (const provider of providersApi.items ?? []) {
  if (!provider.provider_slug) errors.push(`provider missing provider_slug: ${JSON.stringify(provider)}`);
  if (providerSlugs.has(provider.provider_slug)) {
    errors.push(`duplicate provider_slug in API: ${provider.provider_slug}`);
  }
  providerSlugs.add(provider.provider_slug);
  if (!isUrlOrNull(provider.website_url)) {
    errors.push(`provider ${provider.provider_slug} has invalid website_url`);
  }
  if (typeof provider.go_url === "string" && !provider.go_url.startsWith("/go/")) {
    errors.push(`provider ${provider.provider_slug} go_url must be a local /go/ path`);
  }
}

for (const provider of providersApi.items ?? []) {
  try {
    const detail = await readJson(`providers/${provider.provider_slug}.json`);
    validateEnvelope(`providers/${provider.provider_slug}.json`, detail, manifestHash);
    if (detail.item?.provider_slug !== provider.provider_slug) {
      errors.push(`provider detail slug mismatch: ${provider.provider_slug}`);
    }
  } catch (error) {
    errors.push(`provider detail missing or invalid for ${provider.provider_slug}: ${error.message}`);
  }
}

for (const record of pricingApi.items ?? []) {
  if (!providerSlugs.has(record.provider_slug)) {
    errors.push(`pricing record references unknown provider_slug: ${record.provider_slug}`);
  }
  if (!isIsoDate(record.observed_at)) {
    errors.push(`pricing ${record.provider_slug}/${record.proxy_type} observed_at must be YYYY-MM-DD`);
  }
  if (!isUrlOrNull(record.source_url)) {
    errors.push(`pricing ${record.provider_slug}/${record.proxy_type} has invalid source_url`);
  }
  if (record.comparable === true && record.normalized_unit !== "gb") {
    errors.push(`comparable pricing must use normalized_unit=gb: ${record.provider_slug}/${record.proxy_type}`);
  }
}

let previousPrice = -Infinity;
for (const item of cheapestApi.items ?? []) {
  if (typeof item.min_price_per_gb !== "number") {
    errors.push(`cheapest item missing numeric min_price_per_gb: ${JSON.stringify(item)}`);
    continue;
  }
  if (item.min_price_per_gb < previousPrice) {
    errors.push("cheapest items are not sorted by min_price_per_gb");
    break;
  }
  previousPrice = item.min_price_per_gb;
}

if (sourceStatusApi.providers_reviewed !== providersApi.total_count) {
  errors.push("source-status providers_reviewed mismatch");
}
if (sourceStatusApi.pricing_records_reviewed !== pricingApi.total_count) {
  errors.push("source-status pricing_records_reviewed mismatch");
}

if (candidatesApi.export_type !== "proxy_merchant_intel_candidates") {
  errors.push("candidate export_type mismatch");
}

const forbiddenHits = findForbiddenKeys(candidatesApi.items ?? []);
if (forbiddenHits.length) {
  errors.push(`candidate export contains forbidden site fields: ${forbiddenHits.join(", ")}`);
}

const redirectValues = Object.values(redirectsSource.providers ?? {})
  .flatMap((entry) => [entry?.affiliate])
  .filter((value) => typeof value === "string" && value.length > 0);
const candidateText = JSON.stringify(candidatesApi);
for (const affiliateUrl of redirectValues) {
  if (candidateText.includes(affiliateUrl)) {
    errors.push("candidate export leaked an affiliate URL");
    break;
  }
}

for (const candidate of candidatesApi.items ?? []) {
  if (!candidate.merchant_key) errors.push("candidate missing merchant_key");
  if (!candidate.provider_slug) errors.push(`candidate ${candidate.merchant_key} missing provider_slug`);
  if (!isUrlOrNull(candidate.homepage_url)) {
    errors.push(`candidate ${candidate.merchant_key} has invalid homepage_url`);
  }
  if (!Array.isArray(candidate.pricing_evidence) || candidate.pricing_evidence.length === 0) {
    warnings.push(`candidate ${candidate.merchant_key} has no pricing evidence`);
  }
  for (const evidence of candidate.pricing_evidence ?? []) {
    if (!MERCHANT_INTEL_PROXY_TYPES.has(evidence.proxy_type)) {
      errors.push(`candidate ${candidate.merchant_key} evidence has invalid proxy_type for merchant intel: ${evidence.proxy_type}`);
    }
    if (!MERCHANT_INTEL_PRICING_MODELS.has(evidence.pricing_model)) {
      errors.push(`candidate ${candidate.merchant_key} evidence has invalid pricing_model for merchant intel: ${evidence.pricing_model}`);
    }
    if (!isUrlOrNull(evidence.source_url)) {
      errors.push(`candidate ${candidate.merchant_key} evidence has invalid source_url`);
    }
    if (!isIsoDate(evidence.observed_at)) {
      errors.push(`candidate ${candidate.merchant_key} evidence observed_at must be YYYY-MM-DD`);
    }
  }
}

if (warnings.length) {
  console.warn(`API validation warnings (${warnings.length}):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error(`API validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("✓ API v1 validation passed");
