/**
 * Results Display Component for the Proxy Calculator
 */

import { type FunctionalComponent } from "preact";
import { getFaviconUrl } from "../../lib/favicon";
import type { Recommendation, FallbackProvider } from "./types";
import { PresetIcon } from "./Presets";

interface ResultsSummaryProps {
  count: number;
  bandwidth: number;
  proxyType: string;
}

export const ResultsSummary: FunctionalComponent<ResultsSummaryProps> = ({
  count,
  bandwidth,
  proxyType,
}) => {
  return (
    <div class="results-summary">
      <p>
        Found <strong>{count} providers</strong> for{" "}
        <strong>{bandwidth}GB</strong> on <strong>{proxyType}</strong> proxies.
      </p>
    </div>
  );
};

interface RecommendationCardProps {
  rec: Recommendation;
  rank: number;
}

export const RecommendationCard: FunctionalComponent<
  RecommendationCardProps
> = ({ rec, rank }) => {
  return (
    <div
      class={`recommendation-card ${
        rec.isBestValue ? "best-value" : ""
      } ${rec.isMostPopular ? "most-popular" : ""}`}
    >
      <div class="rec-badges">
        {rec.isBestValue && (
          <div class="best-value-badge">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path>
            </svg>
            Best Value
          </div>
        )}
        {rec.isMostPopular && (
          <div class="popular-badge">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
              <path d="M4 22h16"></path>
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
            </svg>
            Most Popular
          </div>
        )}
      </div>

      <div class="rec-header">
        {rec.website_url && (
          <img
            src={getFaviconUrl(rec.website_url, 48)}
            alt={`${rec.provider} favicon`}
            class="rec-favicon"
            width="48"
            height="48"
            loading="lazy"
            decoding="async"
          />
        )}
        <div class="rec-rank">#{rank}</div>
      </div>

      <div class="rec-details">
        <h4>
          <a href={`/provider/${rec.provider_id}`}>{rec.provider}</a>
        </h4>

        <div class="rec-price-row">
          <div class="rec-price">
            <strong>${rec.monthlyCost}</strong>
            <span class="rec-period">/month</span>
          </div>
          <div class="rec-rate">${rec.pricePerGb.toFixed(2)}/GB</div>
        </div>

        <div class="rec-reason">
          <span class="reason-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          {rec.reason}
        </div>

        <div class="rec-meta">{rec.tierLabel}</div>

        {rec.savingsPercent && (
          <div class="rec-savings">
            {rec.savingsPercent}% more than best value
          </div>
        )}
      </div>
    </div>
  );
};

interface NoResultsProps {
  proxyType: string;
  bandwidth: number;
  fallbackProviders: FallbackProvider[];
}

export const NoResults: FunctionalComponent<NoResultsProps> = ({
  proxyType,
  bandwidth,
  fallbackProviders,
}) => {
  return (
    <div class="no-results">
      <div class="no-results-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <h4>No exact matches found</h4>
      <p>
        We couldn't find providers with comparable $/GB pricing for{" "}
        <strong>{proxyType}</strong> proxies at <strong>{bandwidth}GB</strong>.
      </p>
      <p class="help-text">
        Try adjusting your bandwidth or selecting a different proxy type.
      </p>

      {fallbackProviders.length > 0 && (
        <div class="fallback-providers">
          <h5>Alternative {proxyType} providers:</h5>
          <ul class="fallback-list">
            {fallbackProviders.map((fb) => (
              <li key={fb.provider_id}>
                <a href={`/provider/${fb.provider_id}`}>{fb.provider}</a>
                <span class="pricing-model">({fb.pricing_model})</span>
              </li>
            ))}
          </ul>
          <p class="fallback-note">
            These providers use different pricing models. Visit their pages for
            details.
          </p>
        </div>
      )}
    </div>
  );
};

interface ResultsProps {
  recommendations: Recommendation[];
  fallbackProviders: FallbackProvider[];
  bandwidth: number;
  proxyType: string;
  selectedPreset: { id: string; icon: string; name: string };
}

export const Results: FunctionalComponent<ResultsProps> = ({
  recommendations,
  fallbackProviders,
  bandwidth,
  proxyType,
  selectedPreset,
}) => {
  return (
    <div class="calculator-results">
      <div class="results-header">
        <h3>Top Recommendations</h3>
        {selectedPreset.id !== "custom" && (
          <div class="use-case-badge">
            <PresetIcon icon={selectedPreset.icon} />
            {selectedPreset.name}
          </div>
        )}
      </div>

      {recommendations.length === 0 ? (
        <NoResults
          proxyType={proxyType}
          bandwidth={bandwidth}
          fallbackProviders={fallbackProviders}
        />
      ) : (
        <>
          <ResultsSummary
            count={recommendations.length}
            bandwidth={bandwidth}
            proxyType={proxyType}
          />

          <div class="recommendations-list">
            {recommendations.map((rec, idx) => (
              <RecommendationCard key={rec.provider} rec={rec} rank={idx + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
