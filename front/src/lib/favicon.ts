/**
 * Get Google Favicon URL for a given website URL
 * Uses Google's favicon service to fetch high-quality favicons
 */
export function getFaviconUrl(websiteUrl: string, size: number = 32): string {
  try {
    const url = new URL(websiteUrl);
    const domain = url.hostname;

    // Use Google's high-quality favicon V2 service
    // Falls back to default icon if not found
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(websiteUrl)}&size=${size}`;
  } catch (error) {
    // Fallback for invalid URLs
    return `https://www.google.com/s2/favicons?domain=${websiteUrl}&sz=${size}`;
  }
}

/**
 * Get domain from website URL for display
 */
export function getDomain(websiteUrl: string): string {
  try {
    const url = new URL(websiteUrl);
    return url.hostname.replace("www.", "");
  } catch (error) {
    return websiteUrl;
  }
}
