#!/usr/bin/env node

import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4327";
const artifactDir = process.env.ARTIFACT_DIR || path.resolve("browser-qa-artifacts");
const executablePath = process.env.CHROME_EXECUTABLE || detectChromeExecutable();

const failures = [];
const report = [];

const pageSpecs = [
  {
    name: "home",
    path: "/",
    expects: ["compare proxy prices", "directly comparable"],
  },
  {
    name: "providers",
    path: "/providers/",
    expects: ["proxy providers", "official evidence"],
  },
  {
    name: "calculator",
    path: "/calculator/?gb=100&type=datacenter",
    expects: ["proxy price calculator", "recommendations"],
  },
  {
    name: "bright-data",
    path: "/provider/bright-data/",
    expects: ["bright data", "visit official pricing"],
  },
  {
    name: "methodology",
    path: "/methodology/",
    expects: ["methodology", "paid placement rankings"],
  },
];

const viewports = [
  {
    label: "desktop",
    viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  },
  {
    label: "mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  },
];

await fs.mkdir(artifactDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const viewport of viewports) {
    for (const spec of pageSpecs) {
      await auditPage(browser, spec, viewport);
    }
  }

  await auditProvidersTable(browser);
  await auditCalculatorCta(browser);
  await auditChatWidget(browser);
  await auditCandidateExport(browser);
} finally {
  await browser.close();
}

const reportPath = path.join(artifactDir, "browser-qa-report.json");
await fs.writeFile(reportPath, JSON.stringify({ failures, report }, null, 2));

if (failures.length > 0) {
  console.error(
    JSON.stringify({ status: "fail", failures, reportPath }, null, 2),
  );
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", checks: report.length, reportPath }, null, 2));

function detectChromeExecutable() {
  const candidates = [
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => exists(candidate));
}

function exists(filePath) {
  try {
    accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

async function openPage(page, url) {
  const consoleMessages = [];
  const pageErrors = [];

  await page.setCacheEnabled(false);

  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  return { response, consoleMessages, pageErrors };
}

async function auditPage(browserInstance, spec, viewport) {
  const page = await browserInstance.newPage();
  await page.setViewport(viewport.viewport);
  const { response, consoleMessages, pageErrors } = await openPage(
    page,
    new URL(spec.path, baseUrl).toString(),
  );
  const status = response?.status() ?? 0;
  const screenshot = path.join(artifactDir, `${spec.name}-${viewport.label}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const metrics = await page.evaluate(() => {
    const visibleText = document.body.innerText || "";
    const brokenImages = Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.getAttribute("src") || image.src)
      .filter((src) => !src.includes("google.com/s2/favicons"))
      .slice(0, 8);
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;

    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      bodyChars: visibleText.length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflow,
      brokenImages,
      visibleText: visibleText.toLowerCase(),
    };
  });

  const missing = spec.expects.filter(
    (text) =>
      !metrics.visibleText.includes(text) &&
      !metrics.title.toLowerCase().includes(text),
  );
  const relevantConsole = consoleMessages.filter(
    (message) =>
      !message.includes("favicon") &&
      !message.includes("Failed to load resource"),
  );

  if (status !== 200) failures.push(`${spec.name}/${viewport.label}: HTTP ${status}`);
  if (metrics.bodyChars < 1000) {
    failures.push(`${spec.name}/${viewport.label}: body too small (${metrics.bodyChars})`);
  }
  if (metrics.overflow) {
    failures.push(
      `${spec.name}/${viewport.label}: horizontal overflow ${metrics.scrollWidth} > ${metrics.innerWidth}`,
    );
  }
  if (metrics.brokenImages.length > 0) {
    failures.push(
      `${spec.name}/${viewport.label}: broken images ${metrics.brokenImages.join(", ")}`,
    );
  }
  if (missing.length > 0) {
    failures.push(`${spec.name}/${viewport.label}: missing text ${missing.join(" | ")}`);
  }
  if (relevantConsole.length > 0) {
    failures.push(
      `${spec.name}/${viewport.label}: console ${relevantConsole.slice(0, 3).join(" || ")}`,
    );
  }
  if (pageErrors.length > 0) {
    failures.push(`${spec.name}/${viewport.label}: pageerror ${pageErrors.join(" || ")}`);
  }

  report.push({
    page: spec.name,
    viewport: viewport.label,
    status,
    title: metrics.title,
    h1: metrics.h1,
    bodyChars: metrics.bodyChars,
    overflow: metrics.overflow,
    screenshot,
  });

  await page.close();
}

async function auditProvidersTable(browserInstance) {
  const page = await browserInstance.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await openPage(page, new URL("/providers/", baseUrl).toString());
  await page.waitForSelector("[data-table-id]");

  const initialRows = await visibleProviderRows(page);
  await page.type('[data-filter="search"]', "zzzz-no-provider");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("tbody tr[data-provider]")).every(
      (row) => row.style.display === "none",
    ),
  );
  const emptyVisible = await page.$eval("[data-empty-state]", (element) => !element.hidden);
  await page.click("[data-clear-filters]");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("tbody tr[data-provider]")).some(
      (row) => row.style.display !== "none",
    ),
  );
  const restoredRows = await visibleProviderRows(page);
  await page.click('[data-filter="profileOnly"]');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("tbody tr[data-provider]")).some(
      (row) => row.style.display !== "none",
    ),
  );
  const profileRows = await visibleProviderRows(page);
  await page.click('.sort-btn[data-sort="price"]');
  const ariaSort = await page.$eval("[data-sort-heading]", (element) =>
    element.getAttribute("aria-sort"),
  );
  const screenshot = path.join(artifactDir, "providers-interaction-desktop.png");
  await page.screenshot({ path: screenshot, fullPage: true });

  if (initialRows <= 0) failures.push("providers interaction: no initial rows");
  if (!emptyVisible) {
    failures.push("providers interaction: empty state not visible after no-match search");
  }
  if (restoredRows <= 0) {
    failures.push("providers interaction: clear filters did not restore rows");
  }
  if (profileRows <= 0) {
    failures.push("providers interaction: official evidence filter returned no rows");
  }
  if (!["ascending", "descending"].includes(ariaSort || "")) {
    failures.push(`providers interaction: aria-sort not updated (${ariaSort})`);
  }

  report.push({
    interaction: "providers-table",
    initialRows,
    emptyVisible,
    restoredRows,
    profileRows,
    ariaSort,
    screenshot,
  });

  await page.close();
}

async function visibleProviderRows(page) {
  return page.$$eval("tbody tr[data-provider]", (rows) =>
    rows.filter((row) => row.style.display !== "none").length,
  );
}

async function auditCalculatorCta(browserInstance) {
  const page = await browserInstance.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await openPage(
    page,
    new URL("/calculator/?gb=100&type=datacenter", baseUrl).toString(),
  );
  await page.waitForSelector(".recommendation-card", { timeout: 10000 });

  const cta = await page.$eval('.recommendation-card a[href^="/go/"]', (anchor) => ({
    text: anchor.textContent?.trim(),
    href: anchor.getAttribute("href"),
  }));
  const screenshot = path.join(artifactDir, "calculator-cta-mobile.png");
  await page.screenshot({ path: screenshot, fullPage: true });

  if (!cta.text?.includes("Visit official pricing")) {
    failures.push(`calculator CTA text mismatch (${cta.text})`);
  }
  if (!cta.href?.startsWith("/go/")) {
    failures.push(`calculator CTA href mismatch (${cta.href})`);
  }

  report.push({ interaction: "calculator-cta", cta, screenshot });
  await page.close();
}

async function auditChatWidget(browserInstance) {
  const page = await browserInstance.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await openPage(page, new URL("/", baseUrl).toString());
  await page.waitForSelector(".chat-fab", { timeout: 10000 });
  await page.click(".chat-fab");
  await page.waitForSelector('.chat-panel[role="dialog"]', { timeout: 10000 });

  const dialogMeta = await page.$eval(".chat-panel", (element) => ({
    role: element.getAttribute("role"),
    modal: element.getAttribute("aria-modal"),
    labelledby: element.getAttribute("aria-labelledby"),
  }));
  await sleep(250);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".chat-panel"));
  const screenshot = path.join(artifactDir, "chat-closed-mobile.png");
  await page.screenshot({ path: screenshot, fullPage: false });

  if (
    dialogMeta.role !== "dialog" ||
    dialogMeta.modal !== "true" ||
    dialogMeta.labelledby !== "chat-title"
  ) {
    failures.push(`chat dialog aria mismatch ${JSON.stringify(dialogMeta)}`);
  }

  report.push({ interaction: "chat-escape", dialogMeta, closed: true, screenshot });
  await page.close();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function auditCandidateExport(browserInstance) {
  const page = await browserInstance.newPage();
  const response = await page.goto(
    new URL("/api/v1/export/proxy-merchant-intel-candidates.json", baseUrl).toString(),
    { waitUntil: "networkidle2", timeout: 30000 },
  );
  const jsonText = await page.evaluate(() => document.body.innerText || "");
  const data = JSON.parse(jsonText);
  const result = await page.evaluate((payload) => {
    const data = payload;
    const forbidden = [
      "affiliate",
      "go_slug",
      "go_url",
      "publish_mode",
      "site_rank",
      "ranking",
      "sponsor",
      "cta",
      "notes",
    ];

    return {
      status: 200,
      generated_at: data.generated_at,
      data_last_updated: data.data_last_updated,
      total_count: data.total_count,
      itemsLength: data.items.length,
      forbiddenHits: data.items.flatMap((item) =>
        forbidden.filter((key) => Object.prototype.hasOwnProperty.call(item, key)),
      ),
      badEvidence: data.items
        .filter(
          (item) =>
            !item.pricing_evidence?.some(
              (evidence) =>
                evidence.pricing_model === "per_gb" &&
                evidence.normalized_unit === "gb" &&
                evidence.source_url?.startsWith("https://") &&
                evidence.observed_at === data.data_last_updated,
            ),
        )
        .map((item) => item.provider_slug),
    };
  }, data);
  result.status = response?.status() ?? 0;

  if (result.status !== 200) failures.push(`candidate export HTTP ${result.status}`);
  if (result.total_count !== result.itemsLength) {
    failures.push(`candidate export count mismatch ${result.total_count} != ${result.itemsLength}`);
  }
  if (result.itemsLength !== 9) {
    failures.push(`candidate export expected 9 items, got ${result.itemsLength}`);
  }
  if (result.data_last_updated !== "2026-06-01") {
    failures.push(`candidate export data_last_updated ${result.data_last_updated}`);
  }
  if (result.forbiddenHits.length > 0) {
    failures.push(`candidate export forbidden keys ${result.forbiddenHits.join(",")}`);
  }
  if (result.badEvidence.length > 0) {
    failures.push(`candidate export bad evidence ${result.badEvidence.join(",")}`);
  }

  report.push({ interaction: "candidate-export", ...result });
  await page.close();
}
