/**
 * Test utilities and mock data for testing
 */

import type { Tier, PricingRecord, Provider } from "../lib/schemas";

/**
 * Mock pricing tier data
 */
export const mockPricingTiers: Record<string, Tier[]> = {
  cheap: [
    { gb: 10, price_per_gb: 1.0, total: 10, pricing_model: "per_gb" },
    { gb: 50, price_per_gb: 0.8, total: 40, pricing_model: "per_gb" },
    { gb: 100, price_per_gb: 0.5, total: 50, pricing_model: "per_gb" },
  ],
  expensive: [
    { gb: 10, price_per_gb: 5.0, total: 50, pricing_model: "per_gb" },
    { gb: 100, price_per_gb: 3.0, total: 300, pricing_model: "per_gb" },
  ],
  payg: [
    {
      gb: 1,
      price_per_gb: 1.5,
      total: 1.5,
      pricing_model: "per_gb",
      is_payg: true,
    },
  ],
  mixed: [
    { gb: 25, price_per_gb: 3.5, total: 87.5, pricing_model: "per_gb" },
    { gb: 100, price_per_gb: 2.0, total: 200, pricing_model: "per_gb" },
  ],
};

/**
 * Mock pricing records
 */
export const mockPricingRecords: PricingRecord[] = [
  {
    provider_id: "cheap-provider",
    provider_name: "Cheap Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    min_price_per_gb: 0.5,
    max_price_per_gb: 1.0,
    tiers: mockPricingTiers.cheap,
    tier_count: 3,
  },
  {
    provider_id: "expensive-provider",
    provider_name: "Expensive Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    min_price_per_gb: 3.0,
    max_price_per_gb: 5.0,
    tiers: mockPricingTiers.expensive,
    tier_count: 2,
  },
  {
    provider_id: "payg-provider",
    provider_name: "PAYG Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    min_price_per_gb: 1.5,
    max_price_per_gb: 1.5,
    tiers: mockPricingTiers.payg,
    tier_count: 1,
  },
  {
    provider_id: "mixed-provider",
    provider_name: "Mixed Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    min_price_per_gb: 2.0,
    max_price_per_gb: 3.5,
    tiers: mockPricingTiers.mixed,
    tier_count: 2,
  },
  {
    provider_id: "non-comparable-provider",
    provider_name: "Non Comparable Provider",
    proxy_type: "residential",
    comparable: false,
    has_pricing: true,
    pricing_model: "per_ip",
    min_price_per_gb: null,
    max_price_per_gb: null,
    tiers: [],
    tier_count: 0,
  },
];

/**
 * Mock providers
 */
export const mockProviders: Provider[] = [
  {
    id: "cheap-provider",
    name: "Cheap Provider",
    slug: "cheap-provider",
    website_url: "https://cheap.com",
    cheapest_price_per_gb: 0.5,
    has_pricing_data: true,
    pricing_count: 3,
    trial_offer: null,
  },
  {
    id: "expensive-provider",
    name: "Expensive Provider",
    slug: "expensive-provider",
    website_url: "https://expensive.com",
    cheapest_price_per_gb: 3.0,
    has_pricing_data: true,
    pricing_count: 2,
    trial_offer: null,
  },
  {
    id: "payg-provider",
    name: "PAYG Provider",
    slug: "payg-provider",
    website_url: "https://payg.com",
    cheapest_price_per_gb: 1.5,
    has_pricing_data: true,
    pricing_count: 1,
    trial_offer: null,
  },
  {
    id: "mixed-provider",
    name: "Mixed Provider",
    slug: "mixed-provider",
    website_url: "https://mixed.com",
    cheapest_price_per_gb: 2.0,
    has_pricing_data: true,
    pricing_count: 2,
    trial_offer: null,
  },
];

/**
 * Render helper with common options
 */
export const renderOptions = {
  // Add any common render options here
};

/**
 * Wait for async operations
 */
export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Flush pending promises
 */
export const flushPromises = () =>
  new Promise((resolve) => setImmediate(resolve));
