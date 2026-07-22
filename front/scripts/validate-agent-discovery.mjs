#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontDir = path.resolve(scriptDir, "..");
const dist = (...segments) => path.join(frontDir, "dist", ...segments);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const errors = [];

const [llms, wellKnownLlms, catalog, skillIndex, openapi, skill] = await Promise.all([
  readFile(dist("llms.txt"), "utf8"),
  readFile(dist(".well-known", "llms.txt"), "utf8"),
  readJson(dist(".well-known", "api-catalog")),
  readJson(dist(".well-known", "agent-skills", "index.json")),
  readJson(dist("openapi.json")),
  readFile(dist("agent-skills", "proxy-price-comparison", "SKILL.md"), "utf8"),
]);

if (llms !== wellKnownLlms) errors.push("root and well-known llms.txt differ");
if (!llms.includes("# ProxyPrice")) errors.push("llms.txt is missing its site heading");
if (!llms.includes("/api/v1/export/proxy-merchant-intel-candidates.json")) {
  errors.push("llms.txt does not expose the public candidate export");
}
if (!llms.includes("compare_proxy_prices")) {
  errors.push("llms.txt does not describe the calculator WebMCP tool");
}
if (!Array.isArray(catalog.linkset) || catalog.linkset.length !== 1) {
  errors.push("api catalog must contain one linkset entry");
}
const endpoint = "/api/v1/export/proxy-merchant-intel-candidates.json";
if (!openapi.paths?.[endpoint]?.get) errors.push("OpenAPI does not describe the public export");
const indexedSkill = skillIndex.skills?.find((entry) => entry.name === "proxy-price-comparison");
if (!indexedSkill) {
  errors.push("agent skills index does not include proxy-price-comparison");
} else {
  const actualDigest = createHash("sha256").update(skill).digest("hex");
  if (indexedSkill.sha256 !== actualDigest) errors.push("agent skill SHA-256 digest does not match");
}
if (!skill.includes("compare_proxy_prices")) {
  errors.push("agent skill does not describe the calculator WebMCP tool");
}

if (errors.length) {
  console.error(`Agent discovery validation failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("✓ Agent discovery validation passed");
