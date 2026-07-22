import { describe, expect, it } from "vitest";
import { buildProxyPriceComparison } from "../WebMcpCalculatorTools";

describe("buildProxyPriceComparison", () => {
  it("returns a bounded, traceable comparison from the calculator data", () => {
    const result = JSON.parse(
      buildProxyPriceComparison({
        bandwidth_gb: 50,
        proxy_type: "residential",
      }),
    );

    expect(result.result_type).toBe("published_proxy_price_comparison");
    expect(result.requested_bandwidth_gb).toBe(50);
    expect(result.proxy_type).toBe("residential");
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].provider_page_url).toMatch(
      /^https:\/\/proxyprice\.com\/provider\//,
    );
    expect(result.methodology_url).toBe("https://proxyprice.com/methodology/");
  });

  it.each([
    { bandwidth_gb: 0, proxy_type: "residential" },
    { bandwidth_gb: 1001, proxy_type: "residential" },
    { bandwidth_gb: 50.5, proxy_type: "residential" },
    { bandwidth_gb: 50, proxy_type: "rotating" },
  ])("rejects invalid calculator input %#", (input) => {
    expect(() => buildProxyPriceComparison(input)).toThrow();
  });
});
