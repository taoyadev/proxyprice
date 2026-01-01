import type { ProxyType } from "../../lib/proxy-types";

// Use case preset configuration
export interface UseCasePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultBandwidth: number;
  proxyType: ProxyType | null;
}

// Provider recommendation result
export interface Recommendation {
  provider: string;
  proxyType: string;
  monthlyCost: number;
  pricePerGb: number;
  tierLabel: string;
  provider_id: string;
  website_url: string;
  reason: string;
  isBestValue: boolean;
  isMostPopular: boolean;
  isPAYG: boolean;
  savingsPercent?: number;
}

// Fallback provider for non-comparable pricing
export interface FallbackProvider {
  provider: string;
  provider_id: string;
  pricing_model: string;
  website_url: string;
}

// URL parameters from query string
export interface UrlParams {
  bandwidth: string | null;
  proxyType: ProxyType | null;
  useCase: string | null;
}

// Most popular providers set
export const MOST_POPULAR_PROVIDERS = new Set([
  "bright-data",
  "oxylabs",
  "smartproxy",
  "shifter",
  "netnut",
]);

// Use case presets data
export const USE_CASE_PRESETS: readonly UseCasePreset[] = [
  {
    id: "custom",
    name: "Custom",
    icon: "settings",
    description: "Set your own bandwidth",
    defaultBandwidth: 50,
    proxyType: null,
  },
  {
    id: "web-scraping",
    name: "Web Scraping",
    icon: "download",
    description: "Extract data from websites",
    defaultBandwidth: 100,
    proxyType: "residential",
  },
  {
    id: "sneaker-bots",
    name: "Sneaker Bots",
    icon: "shoe",
    description: "Automated shoe purchasing",
    defaultBandwidth: 25,
    proxyType: "residential",
  },
  {
    id: "ad-verification",
    name: "Ad Verification",
    icon: "verified",
    description: "Verify ad placements",
    defaultBandwidth: 200,
    proxyType: "residential",
  },
  {
    id: "seo-monitoring",
    name: "SEO Monitoring",
    icon: "trending",
    description: "Track search rankings",
    defaultBandwidth: 50,
    proxyType: "datacenter",
  },
  {
    id: "social-automation",
    name: "Social Automation",
    icon: "group",
    description: "Manage multiple accounts",
    defaultBandwidth: 75,
    proxyType: "mobile",
  },
] as const;

export type UseCasePresetId = (typeof USE_CASE_PRESETS)[number]["id"];
