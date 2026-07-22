#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontDir = path.resolve(scriptDir, "..");
const source = (...segments) => path.join(frontDir, "src", "data", ...segments);
const publicFile = (...segments) => path.join(frontDir, "public", ...segments);
const siteUrl = "https://proxyprice.com";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeText = async (file, content) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${content.trim()}\n`, "utf8");
};

const [providers, pricing, merchantExport] = await Promise.all([
  readJson(source("providers.json")),
  readJson(source("pricing.json")),
  readJson(publicFile("api", "v1", "export", "proxy-merchant-intel-candidates.json")),
]);

const comparableRecords = pricing.pricing.filter((record) => record.comparable).length;
const priceRows = pricing.pricing.length;
const exportCount = Array.isArray(merchantExport.items) ? merchantExport.items.length : 0;
const typePages = [
  ["Residential proxies", "/residential/"],
  ["Datacenter proxies", "/datacenter/"],
  ["Mobile proxies", "/mobile/"],
  ["ISP proxies", "/isp/"],
];

const llms = `# ProxyPrice

> An independent proxy-price comparison tool. It normalizes publicly listed proxy plans to cost per GB only when the math is fair, and keeps per-IP, per-proxy, per-thread, and quote-only plans separate.

Data snapshot: ${pricing.last_updated}. The current dataset covers ${providers.total_count} providers, ${priceRows} pricing records, and ${comparableRecords} directly comparable records.

## Primary tasks

- Compare residential, datacenter, mobile, and ISP proxy prices: ${siteUrl}/providers/
- Estimate the lowest published comparable plan for a bandwidth need: ${siteUrl}/calculator/
- Review collection, normalization, exclusions, and freshness limits: ${siteUrl}/methodology/
- Inspect a provider's cited official pricing sources: ${siteUrl}/provider/{provider-slug}/

## Important limits

- Rankings use published, comparable $/GB rates; they are not a quality, reliability, or suitability ranking.
- Prices can change. Confirm final terms, availability, and promotions with the provider before purchase.
- ProxyPrice does not sell proxy plans. Affiliate availability does not alter price sorting or comparability labels.

## Machine-readable resources

- API catalog: ${siteUrl}/.well-known/api-catalog
- OpenAPI description for the public candidate export: ${siteUrl}/openapi.json
- Public merchant-intelligence candidate export (${exportCount} records): ${siteUrl}/api/v1/export/proxy-merchant-intel-candidates.json
- Agent skill: ${siteUrl}/agent-skills/proxy-price-comparison/SKILL.md
- Browser agents with WebMCP support can invoke the read-only calculator tool \`compare_proxy_prices\` on ${siteUrl}/calculator/
- XML sitemap: ${siteUrl}/sitemap-index.xml

## Core pages

${typePages.map(([label, pathname]) => `- [${label}](${siteUrl}${pathname})`).join("\n")}
- [Best providers by type](${siteUrl}/best/)
- [All providers](${siteUrl}/providers/)
- [Price calculator](${siteUrl}/calculator/)
- [Methodology](${siteUrl}/methodology/)
- [About ProxyPrice](${siteUrl}/about/)
`;

const skill = `---
name: proxy-price-comparison
description: Compare public proxy pricing with ProxyPrice's normalized dataset and explain the limits of each comparison.
metadata:
  site: ${siteUrl}
  data_last_updated: ${pricing.last_updated}
---

# ProxyPrice comparison

Use this skill when a user needs a transparent comparison of residential, datacenter, mobile, or ISP proxy prices.

## Reliable workflow

1. Start with the provider table or calculator at ${siteUrl}.
2. In a WebMCP-capable browser, use the calculator's read-only \`compare_proxy_prices\` tool with whole-number \`bandwidth_gb\` (1-1000) and \`proxy_type\` (residential, datacenter, mobile, or isp).
3. Treat the displayed $/GB rate as comparable only when ProxyPrice labels the record comparable.
4. Open the provider page before making a recommendation; use the cited official sources to verify the plan.
5. State the dataset snapshot date (${pricing.last_updated}) and tell the user to confirm final provider terms.

## Boundaries

- Do not rank per-IP, per-proxy, per-thread, unlimited-bandwidth, or quote-only plans against $/GB plans.
- Do not present a lowest price as a performance, reliability, anonymity, or legal-compliance recommendation.
- Do not infer that a provider is available in a country or supports a use case unless the provider's official page says so.

## Structured data

The public candidate export is ${siteUrl}/api/v1/export/proxy-merchant-intel-candidates.json. It contains only records with public pricing evidence and is described by ${siteUrl}/openapi.json.
`;

const skillPath = publicFile("agent-skills", "proxy-price-comparison", "SKILL.md");
await writeText(publicFile("llms.txt"), llms);
await writeText(publicFile(".well-known", "llms.txt"), llms);
await writeText(skillPath, skill);

const digest = createHash("sha256").update(`${skill.trim()}\n`).digest("hex");
const apiCatalog = {
  linkset: [
    {
      anchor: `${siteUrl}/api/v1/export/proxy-merchant-intel-candidates.json`,
      "service-desc": [
        { href: `${siteUrl}/openapi.json`, type: "application/vnd.oai.openapi+json;version=3.1" },
      ],
      "service-doc": [
        { href: `${siteUrl}/llms.txt`, type: "text/markdown" },
      ],
    },
  ],
};
const agentSkills = {
  $schema: "https://agentskills.io/schemas/agent-skills-index-v0.2.0.json",
  version: "0.2.0",
  skills: [
    {
      name: "proxy-price-comparison",
      type: "skill",
      description: "Compare public proxy pricing with explicit comparability and freshness limits.",
      url: `${siteUrl}/agent-skills/proxy-price-comparison/SKILL.md`,
      sha256: digest,
    },
  ],
};
const openapi = {
  openapi: "3.1.0",
  info: {
    title: "ProxyPrice public data export",
    version: "1.0.0",
    description: "Read-only machine-readable candidate records backed by public provider pricing evidence.",
  },
  servers: [{ url: siteUrl }],
  paths: {
    "/api/v1/export/proxy-merchant-intel-candidates.json": {
      get: {
        operationId: "getProxyMerchantIntelCandidates",
        summary: "Get public proxy merchant-intelligence candidate records",
        responses: {
          200: {
            description: "Candidate export generated from the current price dataset.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["export_type", "data_last_updated", "total_count", "items"],
                  properties: {
                    export_type: { type: "string", const: "proxy_merchant_intel_candidates" },
                    data_last_updated: { type: "string", format: "date" },
                    total_count: { type: "integer", minimum: 0 },
                    items: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

await writeText(publicFile(".well-known", "api-catalog"), JSON.stringify(apiCatalog, null, 2));
await writeText(publicFile(".well-known", "agent-skills", "index.json"), JSON.stringify(agentSkills, null, 2));
await writeText(publicFile("openapi.json"), JSON.stringify(openapi, null, 2));

console.log(
  JSON.stringify({
    status: "ok",
    dataLastUpdated: pricing.last_updated,
    providers: providers.total_count,
    comparableRecords,
    exportCount,
  }),
);
