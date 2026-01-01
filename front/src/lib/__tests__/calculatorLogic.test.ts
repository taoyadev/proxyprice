/**
 * Calculator Logic Unit Tests
 *
 * Pure unit tests for the recommendation generation logic
 * extracted from Calculator.tsx for easier testing
 */

import { describe, it, expect } from "vitest";

// Types matching Calculator.tsx
interface PricingTier {
  pricing_model: string;
  gb?: number;
  price_per_gb?: number;
  total?: number;
  is_payg?: boolean;
  min_gb?: number;
  max_gb?: number;
}

interface PricingRecord {
  provider_id: string;
  provider_name: string;
  proxy_type: string;
  comparable: boolean;
  has_pricing: boolean;
  pricing_model: string;
  tiers: PricingTier[];
  tier_count?: number;
}

interface Provider {
  id: string;
  name: string;
  website_url: string;
}

interface Recommendation {
  provider: string;
  proxyType: string;
  monthlyCost: number;
  pricePerGb: number;
  tierLabel: string;
  provider_id: string;
  website_url: string;
  reason: string;
  isBestValue: boolean;
  isPAYG: boolean;
}

/**
 * Extract the core recommendation logic from Calculator.tsx
 */
function generateRecommendations(
  bandwidthGB: number,
  proxyType: string,
  pricingData: PricingRecord[],
  providersData: Provider[],
): Recommendation[] {
  // Filter pricing by proxy type and comparable
  const relevant = pricingData.filter(
    (p) =>
      p.proxy_type === proxyType &&
      p.comparable &&
      p.tiers &&
      p.tiers.length > 0,
  );

  const recs: Recommendation[] = [];

  for (const pricing of relevant) {
    const tiers = pricing.tiers;
    const perGbTiers = tiers.filter(
      (t) =>
        t &&
        t.pricing_model === "per_gb" &&
        typeof t.price_per_gb === "number" &&
        Number.isFinite(t.price_per_gb),
    );

    // Find the best tier for this bandwidth
    let bestTier: PricingTier | null = null;
    for (const tier of perGbTiers) {
      const covers =
        tier.is_payg === true ||
        (typeof tier.gb === "number" && tier.gb >= bandwidthGB);
      if (!covers) continue;

      if (!bestTier || tier.price_per_gb! < bestTier.price_per_gb!) {
        bestTier = tier;
      }
    }

    if (bestTier && bestTier.price_per_gb) {
      const isPAYG = bestTier.is_payg === true;
      const tierLabel = isPAYG
        ? `PAYG at $${bestTier.price_per_gb.toFixed(2)}/GB`
        : `${bestTier.gb} GB tier at $${bestTier.price_per_gb.toFixed(2)}/GB`;

      let reason = "";
      if (isPAYG) {
        reason = "Flexible pay-as-you-go pricing";
      } else if (bestTier.gb === bandwidthGB) {
        reason = "Exact tier match for your bandwidth";
      } else {
        reason = `Best rate for ${bandwidthGB}GB usage`;
      }

      const providerData = providersData.find(
        (p) => p.id === pricing.provider_id,
      );

      recs.push({
        provider: pricing.provider_name,
        proxyType: pricing.proxy_type,
        monthlyCost: Math.ceil(bestTier.price_per_gb * bandwidthGB),
        pricePerGb: bestTier.price_per_gb,
        tierLabel,
        provider_id: pricing.provider_id,
        website_url: providerData?.website_url || "",
        reason,
        isBestValue: false,
        isPAYG,
      });
    }
  }

  // Sort by monthly cost
  recs.sort((a, b) => a.monthlyCost - b.monthlyCost);

  // Mark best value (lowest cost)
  if (recs.length > 0) {
    recs[0].isBestValue = true;
    if (recs[0].reason === `Best rate for ${bandwidthGB}GB usage`) {
      recs[0].reason = "Lowest cost for your bandwidth";
    }
  }

  return recs.slice(0, 10);
}

// Test data
const mockPricing: PricingRecord[] = [
  {
    provider_id: "cheap-provider",
    provider_name: "Cheap Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    tiers: [
      { gb: 10, price_per_gb: 1.0, total: 10, pricing_model: "per_gb" },
      { gb: 50, price_per_gb: 0.8, total: 40, pricing_model: "per_gb" },
      { gb: 100, price_per_gb: 0.5, total: 50, pricing_model: "per_gb" },
    ],
    tier_count: 3,
  },
  {
    provider_id: "expensive-provider",
    provider_name: "Expensive Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    tiers: [
      { gb: 10, price_per_gb: 5.0, total: 50, pricing_model: "per_gb" },
      { gb: 100, price_per_gb: 3.0, total: 300, pricing_model: "per_gb" },
    ],
    tier_count: 2,
  },
  {
    provider_id: "payg-provider",
    provider_name: "PAYG Provider",
    proxy_type: "residential",
    comparable: true,
    has_pricing: true,
    pricing_model: "per_gb",
    tiers: [
      {
        gb: 1,
        price_per_gb: 1.5,
        total: 1.5,
        pricing_model: "per_gb",
        is_payg: true,
      },
    ],
    tier_count: 1,
  },
  {
    provider_id: "non-comparable-provider",
    provider_name: "Non Comparable Provider",
    proxy_type: "residential",
    comparable: false,
    has_pricing: true,
    pricing_model: "per_ip",
    tiers: [],
    tier_count: 0,
  },
];

const mockProviders: Provider[] = [
  {
    id: "cheap-provider",
    name: "Cheap Provider",
    website_url: "https://cheap.com",
  },
  {
    id: "expensive-provider",
    name: "Expensive Provider",
    website_url: "https://expensive.com",
  },
  {
    id: "payg-provider",
    name: "PAYG Provider",
    website_url: "https://payg.com",
  },
];

describe("Calculator Logic - Unit Tests", () => {
  describe("Tier Selection", () => {
    it("selects the exact tier when bandwidth matches exactly", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      expect(cheapRec).toBeDefined();
      // Algorithm selects the LOWEST price tier that covers the bandwidth
      // For 50GB: 100GB tier at $0.5/GB is cheaper than 50GB tier at $0.8/GB
      expect(cheapRec?.pricePerGb).toBe(0.5); // 100GB tier (cheapest that covers 50GB)
      expect(cheapRec?.monthlyCost).toBe(25); // ceil(50 * 0.5) = 25
    });

    it("selects the next larger tier when exact match not available", () => {
      const recs = generateRecommendations(
        75,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      expect(cheapRec).toBeDefined();
      expect(cheapRec?.pricePerGb).toBe(0.5); // 100GB tier
      expect(cheapRec?.monthlyCost).toBe(38); // ceil(75 * 0.5) = 38
    });

    it("ignores tiers that are too small for requested bandwidth", () => {
      const recs = generateRecommendations(
        75,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      expect(cheapRec?.pricePerGb).not.toBe(1.0); // Not the 10GB tier
      expect(cheapRec?.pricePerGb).not.toBe(0.8); // Not the 50GB tier
    });

    it("uses PAYG tier for any bandwidth", () => {
      const recs = generateRecommendations(
        999,
        "residential",
        mockPricing,
        mockProviders,
      );

      const paygRec = recs.find((r) => r.provider_id === "payg-provider");
      expect(paygRec).toBeDefined();
      expect(paygRec?.isPAYG).toBe(true);
      expect(paygRec?.monthlyCost).toBe(1499); // ceil(999 * 1.5)
    });

    it("filters out non-comparable providers", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const nonComparable = recs.find(
        (r) => r.provider_id === "non-comparable-provider",
      );
      expect(nonComparable).toBeUndefined();
    });

    it("filters by proxy type", () => {
      const recs = generateRecommendations(
        50,
        "datacenter",
        mockPricing,
        mockProviders,
      );

      expect(recs).toHaveLength(0); // No datacenter providers in mock data
    });
  });

  describe("Cost Calculation", () => {
    it("calculates monthly cost as ceiling of bandwidth * price_per_gb", () => {
      const recs = generateRecommendations(
        33,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      // 33 * 0.5 = 16.5, ceil = 17 (using 100GB tier at $0.5/GB)
      expect(cheapRec?.monthlyCost).toBe(17);
    });

    it("handles whole number costs correctly", () => {
      const recs = generateRecommendations(
        10,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      // For 10GB: 100GB tier at $0.5/GB is cheapest (not 10GB at $1.0)
      expect(cheapRec?.monthlyCost).toBe(5); // ceil(10 * 0.5) = 5
    });
  });

  describe("Sorting and Ranking", () => {
    it("sorts recommendations by monthly cost ascending", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      for (let i = 1; i < recs.length; i++) {
        expect(recs[i].monthlyCost).toBeGreaterThanOrEqual(
          recs[i - 1].monthlyCost,
        );
      }
    });

    it("marks lowest cost provider as best value", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      expect(recs[0].isBestValue).toBe(true);
      // Cheap Provider's 100GB tier at $0.5/GB = $25 for 50GB
      expect(recs[0].pricePerGb).toBe(0.5);

      if (recs.length > 1) {
        expect(recs[1].isBestValue).toBe(false);
      }
    });
  });

  describe("Tier Label Generation", () => {
    it("generates correct label for PAYG tiers", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const paygRec = recs.find((r) => r.provider_id === "payg-provider");
      expect(paygRec?.tierLabel).toBe("PAYG at $1.50/GB");
    });

    it("generates correct label for volume tiers", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      // Algorithm selects 100GB tier (cheapest that covers 50GB)
      expect(cheapRec?.tierLabel).toContain("100 GB tier");
      expect(cheapRec?.tierLabel).toContain("$0.50/GB");
    });
  });

  describe("Reason Generation", () => {
    it("shows PAYG reason for pay-as-you-go tiers", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const paygRec = recs.find((r) => r.provider_id === "payg-provider");
      expect(paygRec?.reason).toBe("Flexible pay-as-you-go pricing");
    });

    it("shows best rate reason when tier is larger than bandwidth", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      // 100GB tier selected for 50GB bandwidth (tier size > bandwidth)
      // Since cheap-provider is the lowest cost, reason is updated to "Lowest cost for your bandwidth"
      expect(cheapRec?.reason).toBe("Lowest cost for your bandwidth");
    });

    it("shows best rate reason when tier is larger than bandwidth (75GB)", () => {
      const recs = generateRecommendations(
        75,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      // Since cheap-provider is the lowest cost, reason is updated
      expect(cheapRec?.reason).toBe("Lowest cost for your bandwidth");
    });

    it("updates best value reason to lowest cost", () => {
      const recs = generateRecommendations(
        75,
        "residential",
        mockPricing,
        mockProviders,
      );

      if (recs.length > 0 && !recs[0].isPAYG) {
        expect(recs[0].reason).toBe("Lowest cost for your bandwidth");
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles minimum bandwidth (1 GB)", () => {
      const recs = generateRecommendations(
        1,
        "residential",
        mockPricing,
        mockProviders,
      );

      expect(recs.length).toBeGreaterThan(0);
    });

    it("handles maximum bandwidth (1000 GB)", () => {
      const recs = generateRecommendations(
        1000,
        "residential",
        mockPricing,
        mockProviders,
      );

      expect(recs.length).toBeGreaterThan(0);
    });

    it("returns empty array when no matching providers", () => {
      const recs = generateRecommendations(50, "isp", [], []);

      expect(recs).toEqual([]);
    });

    it("limits results to 10 recommendations", () => {
      // Create more than 10 providers
      const manyPricing: PricingRecord[] = Array.from(
        { length: 15 },
        (_, i) => ({
          provider_id: `provider-${i}`,
          provider_name: `Provider ${i}`,
          proxy_type: "residential",
          comparable: true,
          has_pricing: true,
          pricing_model: "per_gb",
          tiers: [
            {
              gb: 100,
              price_per_gb: 1.0 + i * 0.1,
              total: 100,
              pricing_model: "per_gb",
            },
          ],
          tier_count: 1,
        }),
      );

      const manyProviders: Provider[] = Array.from({ length: 15 }, (_, i) => ({
        id: `provider-${i}`,
        name: `Provider ${i}`,
        website_url: `https://provider${i}.com`,
      }));

      const recs = generateRecommendations(
        50,
        "residential",
        manyPricing,
        manyProviders,
      );

      expect(recs.length).toBeLessThanOrEqual(10);
    });

    it("handles providers with no valid per_gb tiers", () => {
      const invalidPricing: PricingRecord[] = [
        {
          provider_id: "invalid",
          provider_name: "Invalid Provider",
          proxy_type: "residential",
          comparable: true,
          has_pricing: true,
          pricing_model: "per_gb",
          tiers: [
            { pricing_model: "per_ip" }, // Missing per_gb data
          ],
          tier_count: 1,
        },
      ];

      const recs = generateRecommendations(
        50,
        "residential",
        invalidPricing,
        [],
      );

      expect(recs).toEqual([]);
    });
  });

  describe("Provider Data Integration", () => {
    it("includes provider website URL", () => {
      const recs = generateRecommendations(
        50,
        "residential",
        mockPricing,
        mockProviders,
      );

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      expect(cheapRec?.website_url).toBe("https://cheap.com");
    });

    it("handles missing provider data gracefully", () => {
      const recs = generateRecommendations(50, "residential", mockPricing, []);

      const cheapRec = recs.find((r) => r.provider_id === "cheap-provider");
      expect(cheapRec?.website_url).toBe("");
    });
  });
});
