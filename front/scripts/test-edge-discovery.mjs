#!/usr/bin/env node

import assert from "node:assert/strict";
import { onRequestGet as markdownHome } from "../functions/index.js";
import { onRequestGet as sitemapAlias } from "../functions/sitemap.xml.js";

const originalFetch = globalThis.fetch;
const markdown = "# ProxyPrice\n\nMachine-readable proxy pricing guidance.\n";

try {
  globalThis.fetch = async (request) => {
    assert.equal(new URL(request.url).pathname, "/llms.txt");
    assert.equal(request.headers.get("Accept"), "text/plain");
    return new Response(markdown, {
      headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Origin" },
    });
  };

  const markdownResponse = await markdownHome({
    request: new Request("https://proxyprice.com/", { headers: { Accept: "text/markdown" } }),
    next: () => assert.fail("HTML fallback should not run for an explicit markdown request"),
  });
  assert.equal(markdownResponse.status, 200);
  assert.equal(markdownResponse.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(markdownResponse.headers.get("Content-Location"), "https://proxyprice.com/llms.txt");
  assert.match(markdownResponse.headers.get("Vary") || "", /Accept/);
  assert.equal(await markdownResponse.text(), markdown);

  const htmlFallback = new Response("<html>ProxyPrice</html>", { status: 200 });
  const htmlResponse = await markdownHome({
    request: new Request("https://proxyprice.com/", { headers: { Accept: "text/html" } }),
    next: () => htmlFallback,
  });
  assert.equal(htmlResponse, htmlFallback);

  const redirect = sitemapAlias({ request: new Request("https://proxyprice.com/sitemap.xml") });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("Location"), "https://proxyprice.com/sitemap-index.xml");

  console.log("✓ Edge discovery function tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
