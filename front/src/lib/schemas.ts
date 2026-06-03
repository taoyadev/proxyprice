/**
 * Zod schemas for runtime data validation
 * Prevents production crashes from corrupted or invalid JSON data
 */
import { z } from "zod";

// Provider schema
export const ProviderSchema = z.object({
  id: z.string().min(1, "Provider ID cannot be empty"),
  name: z.string().min(1, "Provider name cannot be empty"),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  website_url: z.string().url("Invalid provider website URL"),
  cheapest_price_per_gb: z.number().nonnegative().nullable(),
  has_pricing_data: z.boolean(),
  pricing_count: z.number().int().nonnegative(),
  trial_offer: z.string().optional().nullable(),
});

export type Provider = z.infer<typeof ProviderSchema>;

// Pricing tier schema
export const TierSchema = z
  .object({
    gb: z.number().positive().optional(),
    price_per_gb: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    pricing_model: z.enum([
      "per_gb",
      "per_ip",
      "per_proxy",
      "per_thread",
      "unknown",
    ]),
    is_payg: z.boolean().optional(),
    price_per_ip: z.number().nonnegative().optional(),
    ips: z.number().int().positive().optional(),
  })
  .passthrough(); // Allow extra fields for flexibility

export type Tier = z.infer<typeof TierSchema>;

// Pricing record schema
export const PricingSchema = z.object({
  provider_id: z.string().min(1),
  provider_name: z.string().min(1),
  proxy_type: z.enum(["residential", "datacenter", "mobile", "isp", "other"]),
  pricing_model: z.string(),
  min_price_per_gb: z.number().nonnegative().nullable(),
  max_price_per_gb: z.number().nonnegative().nullable(),
  comparable: z.boolean(),
  has_pricing: z.boolean(),
  tier_count: z.number().int().nonnegative(),
  tiers: z.array(TierSchema).optional(),
  price_url: z.string().url().nullable().optional(),
});

export type PricingRecord = z.infer<typeof PricingSchema>;

// Providers data file schema
export const ProvidersDataSchema = z.object({
  providers: z.array(ProviderSchema),
  last_updated: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
  total_count: z.number().int().positive(),
});

export type ProvidersData = z.infer<typeof ProvidersDataSchema>;

// Pricing data file schema
export const PricingDataSchema = z.object({
  pricing: z.array(PricingSchema),
  last_updated: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
  total_count: z.number().int().positive(),
});

export type PricingData = z.infer<typeof PricingDataSchema>;

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD");

export const MerchantEntryPriceSchema = z.object({
  amount: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
  unit: z.string().nullable(),
  billing_model: z.string().nullable(),
  term: z.string().nullable(),
  source_url: z.string().url().nullable(),
  observed_at: DateStringSchema.nullable(),
});

export const MerchantProductSchema = z.object({
  product_key: z.string().min(1),
  proxy_type: z.string().nullable(),
  product_category: z.string().nullable(),
  pricing_model: z.string().min(1),
  entry_price: MerchantEntryPriceSchema.nullable(),
  source_url: z.string().url().nullable(),
});

export const MerchantOfficialPageSchema = z.object({
  evidence_key: z.string().nullable(),
  kind: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  observed_at: DateStringSchema.nullable(),
});

export const MerchantProfileSchema = z.object({
  provider_slug: z.string().regex(/^[a-z0-9-]+$/),
  provider_name: z.string().min(1),
  merchant_key: z.string().nullable(),
  display_profile: z.boolean(),
  bundle_state: z.string().nullable(),
  bundle_status: z.string().nullable(),
  names: z
    .object({
      display_name: z.string().min(1),
      aliases: z.array(z.string()),
      legacy_aliases: z.array(z.string()),
    })
    .optional(),
  official: z
    .object({
      homepage_url: z.string().url().nullable(),
      pricing_url: z.string().url().nullable(),
      domains: z.array(z.string()),
    })
    .optional(),
  taxonomy: z
    .object({
      proxy_types: z.array(z.string()),
      product_categories: z.array(z.string()),
    })
    .optional(),
  products: z.array(MerchantProductSchema).optional(),
  positioning: z
    .object({
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      best_for: z.array(z.string()),
      watchouts: z.array(z.string()),
    })
    .optional(),
  evidence: z
    .object({
      official_pages: z.array(MerchantOfficialPageSchema),
    })
    .optional(),
});

export const MerchantProfilesDataSchema = z.object({
  schema_version: z.literal("1.0.0"),
  source: z.literal("proxy-merchant-intel"),
  generated_at: DateStringSchema,
  providers_last_updated: DateStringSchema,
  pricing_last_updated: DateStringSchema,
  total_count: z.number().int().nonnegative(),
  displayable_count: z.number().int().nonnegative(),
  profiles: z.record(MerchantProfileSchema),
});

export type MerchantProfile = z.infer<typeof MerchantProfileSchema>;
export type MerchantProfilesData = z.infer<typeof MerchantProfilesDataSchema>;

export const ProxyMerchantIntelPricingEvidenceSchema = z.object({
  product_key: z.string().min(1),
  proxy_type: z.enum(["residential", "datacenter", "mobile", "isp"]),
  pricing_model: z.literal("per_gb"),
  normalized_unit: z.literal("gb"),
  comparable: z.literal(true),
  min_price_usd_per_gb: z.number().nonnegative(),
  max_price_usd_per_gb: z.number().nonnegative(),
  tier_count: z.number().int().nonnegative(),
  source_url: z.string().url(),
  observed_at: DateStringSchema,
});

export const ProxyMerchantIntelCandidateSchema = z.object({
  merchant_key: z.string().min(1),
  provider_slug: z.string().regex(/^[a-z0-9-]+$/),
  display_name: z.string().min(1),
  homepage_url: z.string().url(),
  official_pages: z.object({
    homepage: z.string().url(),
    pricing: z.string().url(),
  }),
  pricing_evidence: z.array(ProxyMerchantIntelPricingEvidenceSchema).min(1),
  writeback_status: z.literal("candidate"),
});

export const ProxyMerchantIntelCandidateExportSchema = z.object({
  schema_version: z.literal("1.0.0"),
  api_version: z.literal("v1"),
  site_key: z.literal("proxyprice"),
  data_last_updated: DateStringSchema,
  generated_at: z.string().datetime(),
  source_hash: z.string().min(16),
  export_type: z.literal("proxy_merchant_intel_candidates"),
  writeback_policy: z.literal("candidate_only_validate_before_global_write"),
  forbidden_fields_excluded: z.array(z.string()),
  total_count: z.number().int().nonnegative(),
  items: z.array(ProxyMerchantIntelCandidateSchema),
});

export type ProxyMerchantIntelPricingEvidence = z.infer<
  typeof ProxyMerchantIntelPricingEvidenceSchema
>;
export type ProxyMerchantIntelCandidate = z.infer<
  typeof ProxyMerchantIntelCandidateSchema
>;
export type ProxyMerchantIntelCandidateExport = z.infer<
  typeof ProxyMerchantIntelCandidateExportSchema
>;

/**
 * Validate providers data with helpful error messages
 */
export function validateProviders(data: unknown): ProvidersData {
  try {
    return ProvidersDataSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Provider data validation failed:\n${formatted}`);
    }
    throw error;
  }
}

/**
 * Validate pricing data with helpful error messages
 */
export function validatePricing(data: unknown): PricingData {
  try {
    return PricingDataSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Pricing data validation failed:\n${formatted}`);
    }
    throw error;
  }
}

/**
 * Safe parse that returns validation result without throwing
 */
export function safeParseProviders(data: unknown) {
  return ProvidersDataSchema.safeParse(data);
}

/**
 * Safe parse that returns validation result without throwing
 */
export function safeParsePricing(data: unknown) {
  return PricingDataSchema.safeParse(data);
}

export function validateMerchantProfiles(data: unknown): MerchantProfilesData {
  try {
    return MerchantProfilesDataSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Merchant profile data validation failed:\n${formatted}`);
    }
    throw error;
  }
}

export function safeParseMerchantProfiles(data: unknown) {
  return MerchantProfilesDataSchema.safeParse(data);
}

export function validateProxyMerchantIntelCandidateExport(
  data: unknown,
): ProxyMerchantIntelCandidateExport {
  try {
    return ProxyMerchantIntelCandidateExportSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Proxy merchant intel candidate export validation failed:\n${formatted}`);
    }
    throw error;
  }
}

export function safeParseProxyMerchantIntelCandidateExport(data: unknown) {
  return ProxyMerchantIntelCandidateExportSchema.safeParse(data);
}
