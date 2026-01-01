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
  proxy_type: z.enum(["residential", "datacenter", "mobile", "isp"]),
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
