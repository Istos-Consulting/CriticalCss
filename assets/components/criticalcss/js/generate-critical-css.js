#!/usr/bin/env node

const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const penthouse = require("penthouse");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function readStdin() {
  return new Promise(resolve => {
    let data = "";
    process.stdin.on("data", chunk => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw);

  const { id, url, cssPath } = input;

  let html;
  try {
    const res = await axios.get(url);
    html = res.data;
  } catch (e) {
    process.stdout.write(JSON.stringify({
      id,
      mobile: "",
      desktop: "",
      htmlHash: "",
      cssHash: "",
      lastGenerated: new Date().toISOString(),
      error: `HTML fetch failed: ${e.message}`
    }));
    return;
  }

  let cssText;
  try {
    cssText = fs.readFileSync(cssPath, "utf8");
  } catch (e) {
    process.stdout.write(JSON.stringify({
      id,
      mobile: "",
      desktop: "",
      htmlHash: sha256(html),
      cssHash: "",
      lastGenerated: new Date().toISOString(),
      error: `CSS read failed: ${e.message}`
    }));
    return;
  }

  const htmlHash = sha256(html);
  const cssHash = sha256(cssText);

  let mobileCritical = "";
  let desktopCritical = "";

  try {
    mobileCritical = await penthouse({
      url,
      css: cssPath,
      width: 390,
      height: 844,
      timeout: 60000,
      renderWaitTime: 3000,
      blockJSRequests: false,
      puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: { width: 390, height: 844 },
        headless: "new"
      }
    });
  } catch {}

  try {
    desktopCritical = await penthouse({
      url,
      css: cssPath,
      width: 1300,
      height: 900,
      timeout: 60000,
      renderWaitTime: 3000,
      blockJSRequests: false,
      puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: { width: 1300, height: 900 },
        headless: "new"
      }
    });
  } catch {}

  process.stdout.write(JSON.stringify({
    id,
    mobile: mobileCritical,
    desktop: desktopCritical,
    htmlHash,
    cssHash,
    lastGenerated: new Date().toISOString()
  }));
}

main().catch(() => process.exit(1));
