// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [
    preact(),
    sitemap({
      // Affiliate redirect pages are not content pages and should not be crawled.
      filter: (page) => !new URL(page).pathname.startsWith("/go/"),
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
