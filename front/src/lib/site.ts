import pricingData from "../data/pricing.json";

export const SITE_NAME = "ProxyPrice";
export const SITE_URL: string =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ||
  "https://proxyprice.com";
export const DATA_LAST_UPDATED = pricingData.last_updated;

const parseUtcDate = (isoDate: string): Date | null => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const formatLongDate = (isoDate: string): string => {
  const parsed = parseUtcDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
};

export const DATA_LAST_UPDATED_LONG = formatLongDate(DATA_LAST_UPDATED);
export const FEEDBACK_URL: string | null =
  (import.meta.env.PUBLIC_FEEDBACK_URL as string | undefined) ?? null;
