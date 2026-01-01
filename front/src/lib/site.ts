import pricingData from "../data/pricing.json";

export const SITE_NAME = "ProxyPrice";
export const SITE_URL: string =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ||
  "https://proxyprice.com";
export const DATA_LAST_UPDATED = pricingData.last_updated;
export const FEEDBACK_URL: string | null =
  (import.meta.env.PUBLIC_FEEDBACK_URL as string | undefined) ?? null;
