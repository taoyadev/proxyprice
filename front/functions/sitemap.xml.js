/** Preserve the conventional sitemap.xml entrypoint without duplicating Astro's sitemap. */
export const onRequestGet = ({ request }) =>
  Response.redirect(new URL("/sitemap-index.xml", request.url), 301);
