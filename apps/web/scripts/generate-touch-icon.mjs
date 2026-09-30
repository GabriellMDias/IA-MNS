import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { chromium } from "@playwright/test";

// Raster output is only needed by Apple's home-screen icon integration.
const source = new URL("../src/assets/orion-mark.svg", import.meta.url);
const destination = new URL(
  "../src/assets/orion-touch-icon.png",
  import.meta.url,
);
const svg = await readFile(source, "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0;background:#f7f9fa}svg{display:block;width:180px;height:180px}</style>${svg}`,
  );
  const png = await page.screenshot({ type: "png" });
  await writeFile(destination, png);
  process.stdout.write(
    "Orion touch icon generated from the canonical SVG (180×180).\n",
  );
} finally {
  await browser.close();
}
