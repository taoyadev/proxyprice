#!/usr/bin/env node
/**
 * OG Image Generation Script
 *
 * This script generates a PNG version of the OG image from the SVG.
 *
 * Prerequisites:
 *   npm install puppeteer
 *
 * Usage:
 *   node scripts/generate-og-image.mjs
 *
 * Output:
 *   public/og-image.png (1200x630px)
 */

import puppeteer from "puppeteer";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, "../public");
const SVG_PATH = join(PUBLIC_DIR, "og-image.svg");
const PNG_PATH = join(PUBLIC_DIR, "og-image.png");

async function generateOGImage() {
  console.log("Reading SVG file...");
  const svgContent = readFileSync(SVG_PATH, "utf-8");

  // Create HTML wrapper for the SVG
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; }
        body { width: 1200px; height: 630px; }
        svg { width: 1200px; height: 630px; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  console.log("Capturing screenshot...");
  const screenshot = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  await browser.close();

  writeFileSync(PNG_PATH, screenshot);
  console.log(`PNG saved to: ${PNG_PATH}`);
}

generateOGImage().catch(console.error);
