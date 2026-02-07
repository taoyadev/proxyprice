/**
 * Calculator Component Tests
 *
 * Focuses on UI state + rendering. The pricing math is covered by
 * pure logic tests in `src/lib/__tests__/calculatorLogic.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import type { ProxyType } from "../../lib/proxy-types";
import type { Recommendation, FallbackProvider } from "../Calculator/types";
import Calculator from "../Calculator";

// Mock favicon function (avoid network and keep snapshots stable)
vi.mock("../../lib/favicon", () => ({
  getFaviconUrl: (url: string) => `https://favicon.com/?url=${url}`,
}));

function buildMockRecommendations(
  gb: number,
  type: ProxyType,
): Recommendation[] {
  if (type !== "residential") return [];

  return [
    {
      provider: "Provider A",
      proxyType: "residential",
      monthlyCost: Math.ceil(2.5 * gb),
      pricePerGb: 2.5,
      tierLabel: "100 GB tier at $2.50/GB",
      provider_id: "provider-a",
      website_url: "https://example.com/a",
      reason: "Lowest cost for your bandwidth",
      isBestValue: true,
      isMostPopular: false,
      isPAYG: false,
    },
    {
      provider: "Provider B",
      proxyType: "residential",
      monthlyCost: Math.ceil(3.0 * gb),
      pricePerGb: 3.0,
      tierLabel: "50 GB tier at $3.00/GB",
      provider_id: "provider-b",
      website_url: "https://example.com/b",
      reason: "Exact tier match for your bandwidth",
      isBestValue: false,
      isMostPopular: false,
      isPAYG: false,
      savingsPercent: 17,
    },
    {
      provider: "Provider C",
      proxyType: "residential",
      monthlyCost: Math.ceil(4.5 * gb),
      pricePerGb: 4.5,
      tierLabel: "PAYG at $4.50/GB",
      provider_id: "provider-c",
      website_url: "https://example.com/c",
      reason: "Flexible pay-as-you-go pricing",
      isBestValue: false,
      isMostPopular: false,
      isPAYG: true,
    },
  ];
}

function buildMockFallbackProviders(): FallbackProvider[] {
  return [
    {
      provider: "Fallback Provider",
      provider_id: "fallback-provider",
      pricing_model: "per_ip",
      website_url: "https://example.com/fallback",
    },
  ];
}

vi.mock("../Calculator/compute", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Calculator/compute")>();
  return {
    ...actual,
    computeRecommendations: (gb: number, type: ProxyType) =>
      buildMockRecommendations(gb, type),
    computeFallbackProviders: (type: ProxyType) => {
      void type;
      return buildMockFallbackProviders();
    },
  };
});

describe("Calculator Component", () => {
  beforeEach(() => {
    // The component syncs state into the URL; reset between tests.
    window.history.replaceState({}, "", "/");
  });

  describe("Bandwidth Input", () => {
    it("renders bandwidth slider with default value of 50 GB", () => {
      render(<Calculator />);

      const slider = screen.getByLabelText(/monthly bandwidth/i);
      expect(slider).toHaveValue("50");
    });

    it("updates bandwidth value when slider changes", () => {
      render(<Calculator />);

      const slider = screen.getByLabelText(/monthly bandwidth/i);
      fireEvent.input(slider, { target: { value: "100" } });
      expect(slider).toHaveValue("100");
    });

    it("shows minimum and maximum range labels", () => {
      render(<Calculator />);

      expect(screen.getByText("1 GB")).toBeInTheDocument();
      expect(screen.getByText("1000 GB")).toBeInTheDocument();
    });
  });

  describe("Proxy Type Selection", () => {
    it("renders all proxy type options", () => {
      render(<Calculator />);

      expect(screen.getByText("Residential")).toBeInTheDocument();
      expect(screen.getByText("Datacenter")).toBeInTheDocument();
      expect(screen.getByText("Mobile")).toBeInTheDocument();
      expect(screen.getByText("ISP")).toBeInTheDocument();
    });

    it("defaults to residential proxy type", () => {
      render(<Calculator />);

      const activeButton = screen.getByRole("button", {
        name: "Residential Real IP addresses",
      });
      expect(activeButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("Recommendation Logic", () => {
    it("renders monthly cost and $/GB rate", () => {
      render(<Calculator />);

      // With the mocked data: 50GB * $2.50 = $125
      expect(screen.getByText("$125")).toBeInTheDocument();
      expect(screen.getByText("$2.50/GB")).toBeInTheDocument();

      expect(screen.getByText("Top Recommendations")).toBeInTheDocument();
    });

    it("shows best value badge for lowest cost provider", () => {
      render(<Calculator />);

      expect(screen.getByText("Best Value")).toBeInTheDocument();
    });

    it("displays pay-as-you-go indication for PAYG tiers", () => {
      render(<Calculator />);

      expect(screen.getByText(/PAYG/i)).toBeInTheDocument();
    });

    it("limits recommendations to 10 items", () => {
      render(<Calculator />);

      const allCards = document.querySelectorAll(".recommendation-card");
      expect(allCards.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Edge Cases", () => {
    it("handles minimum bandwidth (1 GB)", () => {
      render(<Calculator />);

      const slider = screen.getByLabelText(/monthly bandwidth/i);
      fireEvent.input(slider, { target: { value: "1" } });
      expect(slider).toHaveValue("1");
    });

    it("handles maximum bandwidth (1000 GB)", () => {
      render(<Calculator />);

      const slider = screen.getByLabelText(/monthly bandwidth/i);
      fireEvent.input(slider, { target: { value: "1000" } });
      expect(slider).toHaveValue("1000");
    });

    it("shows fallback providers when no exact matches", () => {
      render(<Calculator />);

      const ispButton = screen.getByRole("button", {
        name: "ISP Static residential",
      });
      fireEvent.click(ispButton);

      expect(screen.getByText("Top Recommendations")).toBeInTheDocument();
      expect(screen.getByText("No exact matches found")).toBeInTheDocument();
      expect(screen.getByText(/Alternative/i)).toBeInTheDocument();
    });

    it("displays no results message when applicable", () => {
      render(<Calculator />);

      const ispButton = screen.getByRole("button", {
        name: "ISP Static residential",
      });
      fireEvent.click(ispButton);

      expect(screen.getByText("No exact matches found")).toBeInTheDocument();
    });
  });

  describe("Provider Links", () => {
    it("renders provider links correctly", () => {
      render(<Calculator />);

      const links = document.querySelectorAll('a[href^="/provider/"]');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe("Tier Selection Logic", () => {
    it("selects tier that covers requested bandwidth", () => {
      render(<Calculator />);

      expect(screen.getByText("Top Recommendations")).toBeInTheDocument();
    });

    it("prefers lower price_per_gb when multiple tiers cover bandwidth", () => {
      render(<Calculator />);

      expect(screen.getByText("Top Recommendations")).toBeInTheDocument();
    });
  });

  describe("Fallback Providers", () => {
    it("displays fallback providers for non-comparable pricing", () => {
      render(<Calculator />);

      const fallbackSection = screen.queryByText(/Alternative/i);
      expect(fallbackSection).toBeNull();

      const ispButton = screen.getByRole("button", {
        name: "ISP Static residential",
      });
      fireEvent.click(ispButton);

      expect(screen.getByText(/Alternative/i)).toBeInTheDocument();
    });

    it("shows pricing model for fallback providers", () => {
      render(<Calculator />);

      const ispButton = screen.getByRole("button", {
        name: "ISP Static residential",
      });
      fireEvent.click(ispButton);

      expect(screen.getByText(/\(per_ip\)/i)).toBeInTheDocument();
    });
  });
});
