import { signal, computed } from "@preact/signals";
import type { FunctionalComponent } from "preact";
import pricingData from "../data/pricing.json";
import providersData from "../data/providers.json";

const bandwidth = signal(50);
const proxyType = signal("residential");

// Get Google Favicon URL for a provider
const getFaviconUrl = (websiteUrl: string, size: number = 32): string => {
  try {
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(websiteUrl)}&size=${size}`;
  } catch (error) {
    return `https://www.google.com/s2/favicons?domain=${websiteUrl}&sz=${size}`;
  }
};

interface Recommendation {
  provider: string;
  proxyType: string;
  monthlyCost: number;
  pricePerGb: number;
  tierLabel: string;
  provider_id: string;
  website_url: string;
  reason: string; // Why this provider is recommended
  isBestValue: boolean; // Lowest cost for this tier
  isPAYG: boolean; // Pay-as-you-go flexibility
}

const recommendations = computed(() => {
  const gb = bandwidth.value;
  const type = proxyType.value;

  // Filter pricing by proxy type and comparable
  const relevant = pricingData.pricing.filter(
    (p) =>
      p.proxy_type === type && p.comparable && p.tiers && p.tiers.length > 0,
  );

  const recs: Recommendation[] = [];

  for (const pricing of relevant) {
    const tiers = pricing.tiers as any[];
    const perGbTiers = tiers.filter(
      (t) =>
        t &&
        t.pricing_model === "per_gb" &&
        typeof t.price_per_gb === "number" &&
        Number.isFinite(t.price_per_gb),
    ) as any[];

    // Find the best tier for this bandwidth.
    // - A volume tier covers the request when tier.gb >= requested GB
    // - A PAYG tier covers any GB amount (tier.is_payg === true)
    let bestTier: any = null;
    for (const tier of perGbTiers) {
      const covers =
        tier.is_payg === true || (typeof tier.gb === "number" && tier.gb >= gb);
      if (!covers) continue;

      if (!bestTier || tier.price_per_gb < bestTier.price_per_gb) {
        bestTier = tier;
      }
    }

    if (bestTier && bestTier.price_per_gb) {
      const isPAYG = bestTier.is_payg === true;
      const tierLabel = isPAYG
        ? `PAYG at $${bestTier.price_per_gb.toFixed(2)}/GB`
        : `${bestTier.gb} GB tier at $${bestTier.price_per_gb.toFixed(2)}/GB`;

      // Generate reason for recommendation
      let reason = "";
      if (isPAYG) {
        reason = "Flexible pay-as-you-go pricing";
      } else if (bestTier.gb === gb) {
        reason = "Exact tier match for your bandwidth";
      } else {
        reason = `Best rate for ${gb}GB usage`;
      }

      const providerData = providersData.providers.find(
        (p) => p.id === pricing.provider_id,
      );

      recs.push({
        provider: pricing.provider_name,
        proxyType: pricing.proxy_type,
        monthlyCost: Math.ceil(bestTier.price_per_gb * gb),
        pricePerGb: bestTier.price_per_gb,
        tierLabel,
        provider_id: pricing.provider_id,
        website_url: providerData?.website_url || "",
        reason,
        isBestValue: false, // Will be set below
        isPAYG,
      });
    }
  }

  // Sort by monthly cost
  recs.sort((a, b) => a.monthlyCost - b.monthlyCost);

  // Mark best value (lowest cost)
  if (recs.length > 0) {
    recs[0].isBestValue = true;
    if (recs[0].reason === `Best rate for ${gb}GB usage`) {
      recs[0].reason = "Lowest cost for your bandwidth";
    }
  }

  return recs.slice(0, 10);
});

// Fallback providers when no comparable matches
const fallbackProviders = computed(() => {
  const type = proxyType.value;

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
});

const Calculator: FunctionalComponent = () => {
  return (
    <div class="calculator">
      <div class="calculator-inputs">
        <div class="input-group">
          <label htmlFor="bandwidth">
            Monthly Bandwidth (GB)
            <span class="input-value">{bandwidth.value} GB</span>
          </label>
          <input
            type="range"
            id="bandwidth"
            min="1"
            max="1000"
            step="1"
            value={bandwidth.value}
            onInput={(e) =>
              (bandwidth.value = parseInt((e.target as HTMLInputElement).value))
            }
          />
          <div class="range-labels">
            <span>1 GB</span>
            <span>1000 GB</span>
          </div>
        </div>

        <div class="input-group">
          <label htmlFor="proxy-type">Proxy Type</label>
          <select
            id="proxy-type"
            value={proxyType.value}
            onChange={(e) =>
              (proxyType.value = (e.target as HTMLSelectElement).value)
            }
          >
            <option value="residential">Residential</option>
            <option value="datacenter">Datacenter</option>
            <option value="mobile">Mobile</option>
            <option value="isp">ISP</option>
          </select>
        </div>
      </div>

      <div class="calculator-results">
        <h3>Top Recommendations</h3>

        {recommendations.value.length === 0 && (
          <div class="no-results">
            <h4>No exact matches found</h4>
            <p>
              We couldn't find providers with comparable $/GB pricing for{" "}
              <strong>{proxyType.value}</strong> proxies at{" "}
              <strong>{bandwidth.value}GB</strong>.
            </p>
            <p class="help-text">
              Try adjusting your bandwidth or selecting a different proxy type.
              Or explore these alternative providers:
            </p>

            {fallbackProviders.value.length > 0 && (
              <div class="fallback-providers">
                <h5>Alternative {proxyType.value} providers:</h5>
                <ul class="fallback-list">
                  {fallbackProviders.value.map((fb) => (
                    <li key={fb.provider_id}>
                      <a href={`/provider/${fb.provider_id}`}>{fb.provider}</a>
                      <span class="pricing-model">({fb.pricing_model})</span>
                    </li>
                  ))}
                </ul>
                <p class="fallback-note">
                  These providers use {fallbackProviders.value[0].pricing_model}{" "}
                  pricing. Visit their pages for details.
                </p>
              </div>
            )}
          </div>
        )}

        <div class="recommendations-list">
          {recommendations.value.map((rec, idx) => (
            <div key={rec.provider} class="recommendation-card">
              {rec.isBestValue && (
                <div class="best-value-badge">Best Value</div>
              )}
              <div class="rec-header">
                {rec.website_url && (
                  <img
                    src={getFaviconUrl(rec.website_url, 32)}
                    alt={`${rec.provider} favicon`}
                    class="rec-favicon"
                    width="32"
                    height="32"
                  />
                )}
                <div class="rec-rank">#{idx + 1}</div>
              </div>
              <div class="rec-details">
                <h4>
                  <a href={`/provider/${rec.provider_id}`}>{rec.provider}</a>
                </h4>
                <div class="rec-price">
                  <strong>${rec.monthlyCost}</strong>/month
                </div>
                <div class="rec-rate">${rec.pricePerGb.toFixed(2)}/GB</div>
                <div class="rec-reason">
                  <span class="reason-icon">✓</span> {rec.reason}
                </div>
                <div class="rec-meta">{rec.tierLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Calculator;
