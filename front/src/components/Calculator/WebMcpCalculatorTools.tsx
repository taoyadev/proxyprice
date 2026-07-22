/**
 * Progressive WebMCP support for the on-page calculator.
 *
 * The tool deliberately uses the same calculation function as the visible UI,
 * so browser agents receive the same bounded, published-price comparison a
 * visitor would see. It is available only when a browser exposes WebMCP.
 */

import { useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { DATA_LAST_UPDATED, SITE_URL } from "../../lib/site";
import { isValidProxyType, type ProxyType } from "../../lib/proxy-types";
import { computeRecommendations } from "./compute";

const MIN_BANDWIDTH_GB = 1;
const MAX_BANDWIDTH_GB = 1000;

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
  };
  execute: (input: Record<string, unknown>) => Promise<string>;
}

interface WebMcpModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

type WebMcpDocument = Document & {
  modelContext?: WebMcpModelContext;
};

export interface ProxyPriceComparisonInput {
  bandwidth_gb: number;
  proxy_type: ProxyType;
}

/**
 * Calculate an agent-safe, JSON result from the same data and logic as the UI.
 * Throws actionable input errors because JSON Schema constraints are advisory.
 */
export function buildProxyPriceComparison(
  input: Record<string, unknown>,
): string {
  const bandwidth = input.bandwidth_gb;
  const proxyType = input.proxy_type;

  if (
    typeof bandwidth !== "number" ||
    !Number.isInteger(bandwidth) ||
    bandwidth < MIN_BANDWIDTH_GB ||
    bandwidth > MAX_BANDWIDTH_GB
  ) {
    throw new Error(
      `bandwidth_gb must be a whole number from ${MIN_BANDWIDTH_GB} to ${MAX_BANDWIDTH_GB}.`,
    );
  }

  if (typeof proxyType !== "string" || !isValidProxyType(proxyType)) {
    throw new Error(
      "proxy_type must be one of: residential, datacenter, mobile, isp.",
    );
  }

  const comparisonInput: ProxyPriceComparisonInput = {
    bandwidth_gb: bandwidth,
    proxy_type: proxyType,
  };
  const recommendations = computeRecommendations(
    comparisonInput.bandwidth_gb,
    comparisonInput.proxy_type,
  );

  return JSON.stringify({
    result_type: "published_proxy_price_comparison",
    data_last_updated: DATA_LAST_UPDATED,
    requested_bandwidth_gb: comparisonInput.bandwidth_gb,
    proxy_type: comparisonInput.proxy_type,
    comparison_method:
      "Lowest listed plan price among published comparable tiers that cover the requested bandwidth, or a proportional estimate for published PAYG pricing.",
    recommendations: recommendations.map((recommendation) => ({
      provider: recommendation.provider,
      purchase_cost_usd: recommendation.monthlyCost,
      cost_basis: recommendation.costBasis,
      published_price_per_gb_usd: recommendation.pricePerGb,
      selected_tier: recommendation.tierLabel,
      reason: recommendation.reason,
      provider_page_url: `${SITE_URL}/provider/${recommendation.provider_id}/`,
      provider_website_url: recommendation.website_url,
      best_value: recommendation.isBestValue,
    })),
    methodology_url: `${SITE_URL}/methodology/`,
    calculator_url: `${SITE_URL}/calculator/?gb=${comparisonInput.bandwidth_gb}&type=${comparisonInput.proxy_type}`,
    limits: [
      "Only plans normalized fairly to cost per GB are compared.",
      "Prices, availability, promotions, and final terms can change; verify the cited provider page before purchase.",
      "A lowest published price is not a performance, reliability, anonymity, or legal-compliance recommendation.",
    ],
  });
}

const WebMcpCalculatorTools: FunctionalComponent = () => {
  useEffect(() => {
    const modelContext = (document as WebMcpDocument).modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const tool: WebMcpTool = {
      name: "compare_proxy_prices",
      description:
        "Calculate published comparable proxy-price options for a monthly bandwidth need and proxy type. Use this for a transparent cost estimate with provider and methodology links.",
      inputSchema: {
        type: "object",
        properties: {
          bandwidth_gb: {
            type: "number",
            minimum: MIN_BANDWIDTH_GB,
            maximum: MAX_BANDWIDTH_GB,
            multipleOf: 1,
            description: "Estimated monthly bandwidth in whole gigabytes.",
          },
          proxy_type: {
            type: "string",
            enum: ["residential", "datacenter", "mobile", "isp"],
            description: "The proxy network type to compare.",
          },
        },
        required: ["bandwidth_gb", "proxy_type"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => buildProxyPriceComparison(input),
    };

    void modelContext
      .registerTool(tool, { signal: controller.signal })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return null;
};

export default WebMcpCalculatorTools;
