/**
 * Shared proxy type definitions and utilities
 * DRY - single source of truth for proxy type labels
 */

/**
 * Valid proxy types in the system
 */
export type ProxyType = "residential" | "datacenter" | "mobile" | "isp";

/**
 * Human-readable labels for proxy types
 */
const PROXY_TYPE_LABELS: Record<ProxyType, string> = {
  residential: "Residential",
  datacenter: "Datacenter",
  mobile: "Mobile",
  isp: "ISP",
};

/**
 * Get human-readable label for a proxy type
 * @param type - The proxy type key
 * @returns The human-readable label, or the original type if not found
 */
export function getProxyTypeLabel(type: string): string {
  return PROXY_TYPE_LABELS[type as ProxyType] || type;
}

/**
 * Check if a string is a valid proxy type
 */
export function isValidProxyType(type: string): type is ProxyType {
  return type in PROXY_TYPE_LABELS;
}

/**
 * All valid proxy types as an array
 */
export const PROXY_TYPES: ProxyType[] = Object.keys(
  PROXY_TYPE_LABELS,
) as ProxyType[];
