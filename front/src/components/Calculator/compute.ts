/**
 * Pure computation functions for the Proxy Calculator
 * These functions have no side effects and can be tested independently
 */

import type { ProxyType } from "../../lib/proxy-types";
import type { Recommendation, FallbackProvider } from "./types";
import { MOST_POPULAR_PROVIDERS } from "./types";
import calculatorData from "../../data/calculator-data.json";

// Re-export the popular providers set for use in components
export { MOST_POPULAR_PROVIDERS };

/**
 * Compute provider recommendations based on bandwidth and proxy type
 * @param gb - Monthly bandwidth in GB
 * @param type - Proxy type (residential, datacenter, mobile, isp)
 * @returns Sorted array of recommendations
 */
export function computeRecommendations(
  gb: number,
  type: ProxyType,
): Recommendation[] {
  const relevant = calculatorData.comparable_pricing.filter(
    (record) => record.proxy_type === type && record.tiers.length > 0,
  );

  const recs: Recommendation[] = [];

  for (const pricing of relevant) {
    const tiers = pricing.tiers;

    // Find the best tier for this bandwidth
    let bestTier: (typeof tiers)[number] | null = null;
    for (const tier of tiers) {
      const covers =
        tier.is_payg === true || (typeof tier.gb === "number" && tier.gb >= gb);
      if (!covers) continue;

      if (
        !bestTier ||
        tier.price_per_gb < bestTier.price_per_gb
      ) {
        bestTier = tier;
      }
    }

    if (bestTier?.price_per_gb) {
      const isPAYG = bestTier.is_payg === true;
      const tierLabel = isPAYG
        ? `PAYG at $${bestTier.price_per_gb.toFixed(2)}/GB`
        : `${bestTier.gb} GB tier at $${bestTier.price_per_gb.toFixed(2)}/GB`;

      let reason = "";
      if (isPAYG) {
        reason = "Flexible pay-as-you-go pricing";
      } else if (bestTier.gb === gb) {
        reason = "Exact tier match for your bandwidth";
      } else {
        reason = `Best rate for ${gb}GB usage`;
      }
      const isMostPopular = MOST_POPULAR_PROVIDERS.has(pricing.provider_id);

      recs.push({
        provider: pricing.provider_name,
        proxyType: pricing.proxy_type,
        monthlyCost: Math.ceil(bestTier.price_per_gb * gb),
        pricePerGb: bestTier.price_per_gb,
        tierLabel,
        provider_id: pricing.provider_id,
        website_url: pricing.website_url || "",
        reason,
        isBestValue: false,
        isMostPopular,
        isPAYG,
      });
    }
  }

  // Sort by monthly cost
  recs.sort((a, b) => a.monthlyCost - b.monthlyCost);

  // Mark best value and calculate savings
  if (recs.length > 0) {
    const lowestCost = recs[0].monthlyCost;
    recs[0].isBestValue = true;
    if (recs[0].reason === `Best rate for ${gb}GB usage`) {
      recs[0].reason = "Lowest cost for your bandwidth";
    }

    // Calculate savings for other providers
    recs.forEach((rec, idx) => {
      if (idx > 0 && rec.monthlyCost > lowestCost) {
        rec.savingsPercent = Math.round(
          ((rec.monthlyCost - lowestCost) / rec.monthlyCost) * 100,
        );
      }
    });

    // Move most popular providers to the top (within same price tier)
    const priceTiers = new Map<number, Recommendation[]>();
    recs.forEach((rec) => {
      const price = rec.monthlyCost;
      if (!priceTiers.has(price)) {
        priceTiers.set(price, []);
      }
      priceTiers.get(price)!.push(rec);
    });

    const sortedRecs: Recommendation[] = [];
    priceTiers.forEach((tierRecs) => {
      tierRecs.sort((a, b) => {
        if (a.isMostPopular && !b.isMostPopular) return -1;
        if (!a.isMostPopular && b.isMostPopular) return 1;
        return 0;
      });
      sortedRecs.push(...tierRecs);
    });

    return sortedRecs.slice(0, 10);
  }

  return recs.slice(0, 10);
}

/**
 * Compute fallback providers for non-comparable pricing models
 * @param type - Proxy type
 * @returns Array of providers with non-comparable pricing
 */
export function computeFallbackProviders(type: ProxyType): FallbackProvider[] {
  const candidates = calculatorData.fallback_pricing.filter(
    (record) => record.proxy_type === type,
  );

  return candidates.slice(0, 5).map((record) => ({
    provider: record.provider_name,
    provider_id: record.provider_id,
    pricing_model: record.pricing_model,
    website_url: record.website_url || "#",
  }));
}

/**
 * Get URL parameters from query string
 * @returns Object containing parsed URL parameters
 */
export function getUrlParams(): {
  bandwidth: string | null;
  proxyType: ProxyType | null;
  useCase: string | null;
} {
  if (typeof window === "undefined") {
    return { bandwidth: null, proxyType: null, useCase: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    bandwidth: params.get("gb"),
    proxyType: params.get("type") as ProxyType | null,
    useCase: params.get("useCase"),
  };
}

/**
 * Build URL query string from calculator state
 * @param bandwidth - Monthly bandwidth in GB
 * @param proxyType - Selected proxy type
 * @param selectedPreset - Current preset configuration
 * @returns Query string without leading "?"
 */
export function buildQueryString(
  bandwidth: number,
  proxyType: ProxyType,
  selectedPreset: { id: string },
): string {
  const params = new URLSearchParams();

  if (selectedPreset.id !== "custom") {
    params.set("useCase", selectedPreset.id);
  }
  if (bandwidth !== 50) {
    params.set("gb", bandwidth.toString());
  }
  if (proxyType !== "residential") {
    params.set("type", proxyType);
  }

  return params.toString();
}
