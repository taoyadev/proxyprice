/**
 * Pure computation functions for the Proxy Calculator
 * These functions have no side effects and can be tested independently
 */

import type { Tier } from "../../lib/schemas";
import type { ProxyType } from "../../lib/proxy-types";
import type { Recommendation, FallbackProvider } from "./types";
import { MOST_POPULAR_PROVIDERS } from "./types";
import pricingData from "../../data/pricing.json";
import providersData from "../../data/providers.json";

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
  // Filter pricing by proxy type and comparable
  const relevant = pricingData.pricing.filter(
    (p) =>
      p.proxy_type === type && p.comparable && p.tiers && p.tiers.length > 0,
  );

  const recs: Recommendation[] = [];

  for (const pricing of relevant) {
    const tiers = pricing.tiers as Tier[];
    const perGbTiers = tiers.filter(
      (t): t is Tier & { price_per_gb: number } =>
        t &&
        t.pricing_model === "per_gb" &&
        typeof t.price_per_gb === "number" &&
        Number.isFinite(t.price_per_gb),
    );

    // Find the best tier for this bandwidth
    let bestTier: Tier | null = null;
    for (const tier of perGbTiers) {
      const covers =
        tier.is_payg === true || (typeof tier.gb === "number" && tier.gb >= gb);
      if (!covers) continue;

      if (
        !bestTier ||
        tier.price_per_gb <
          (bestTier as Tier & { price_per_gb: number }).price_per_gb
      ) {
        bestTier = tier;
      }
    }

    const typedBestTier = bestTier as (Tier & { price_per_gb: number }) | null;
    if (typedBestTier && typedBestTier.price_per_gb) {
      const isPAYG = typedBestTier.is_payg === true;
      const tierLabel = isPAYG
        ? `PAYG at $${typedBestTier.price_per_gb.toFixed(2)}/GB`
        : `${typedBestTier.gb} GB tier at $${typedBestTier.price_per_gb.toFixed(2)}/GB`;

      let reason = "";
      if (isPAYG) {
        reason = "Flexible pay-as-you-go pricing";
      } else if (typedBestTier.gb === gb) {
        reason = "Exact tier match for your bandwidth";
      } else {
        reason = `Best rate for ${gb}GB usage`;
      }

      const providerData = providersData.providers.find(
        (p) => p.id === pricing.provider_id,
      );
      const isMostPopular = MOST_POPULAR_PROVIDERS.has(pricing.provider_id);

      recs.push({
        provider: pricing.provider_name,
        proxyType: pricing.proxy_type,
        monthlyCost: Math.ceil(typedBestTier.price_per_gb * gb),
        pricePerGb: typedBestTier.price_per_gb,
        tierLabel,
        provider_id: pricing.provider_id,
        website_url: providerData?.website_url || "",
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
  const nonComparable = pricingData.pricing.filter(
    (p) => p.proxy_type === type && !p.comparable && p.has_pricing,
  );

  return nonComparable.slice(0, 5).map((p) => ({
    provider: p.provider_name,
    provider_id: p.provider_id,
    pricing_model: p.pricing_model,
    website_url:
      providersData.providers.find((prov) => prov.id === p.provider_id)
        ?.website_url || "#",
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
