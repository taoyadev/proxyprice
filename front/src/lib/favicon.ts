/**
 * Get Google Favicon URL for a given website URL
 * Uses Google's favicon service to fetch high-quality favicons
 */
export function getFaviconUrl(websiteUrl: string, size: number = 32): string {
  // Use Google's high-quality favicon V2 service
  // Falls back to default icon if not found
  return (
    "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=" +
    encodeURIComponent(websiteUrl) +
    "&size=" +
    size
  );
}

/**
 * Get domain from website URL for display
 */
export function getDomain(websiteUrl: string): string {
  try {
    const url = new URL(websiteUrl);
    return url.hostname.replace("www.", "");
  } catch {
    return websiteUrl;
  }
}
