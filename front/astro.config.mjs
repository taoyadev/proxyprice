// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";

const merchantProfilesData = JSON.parse(
  readFileSync(new URL("./src/data/merchant-profiles.json", import.meta.url), "utf8")
);

/** @param {any} profile */
const hasIndexableMerchantProfile = (profile) =>
  profile?.display_profile === true &&
  Boolean(profile?.merchant_key) &&
  Boolean(profile?.names?.display_name) &&
  Boolean(profile?.official?.homepage_url) &&
  Boolean(profile?.official?.pricing_url) &&
  (profile?.products || []).length > 0 &&
  (profile?.evidence?.official_pages || []).length > 0;

const indexableProviderPaths = new Set(
  Object.entries(merchantProfilesData.profiles || {})
    .filter(([, profile]) => hasIndexableMerchantProfile(profile))
    .map(([slug]) => `/provider/${slug}/`)
);

// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [
    preact(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;

        // Affiliate redirect pages are not content pages and should not be crawled.
        if (pathname.startsWith("/go/")) return false;

        // Keep provider sitemap entries aligned with the page-level noindex gate.
        if (pathname.startsWith("/provider/")) {
          return indexableProviderPaths.has(pathname.endsWith("/") ? pathname : `${pathname}/`);
        }

        return true;
      },
    }),
  ],
  site: process.env.PUBLIC_SITE_URL || "https://proxyprice.com",
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      cssMinify: true,
      minify: "esbuild",
    },
  },
});
