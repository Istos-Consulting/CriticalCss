const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const penthouse = require('penthouse');

const [queueFile, cssFile, outputDir] = process.argv.slice(2);
if (!queueFile || !cssFile || !outputDir) {
  throw new Error(
    'Usage: node generate-critical-css.js <queue.json> <source.css> <output-directory>'
  );
}

const manifestPath = path.join(outputDir, 'critical-manifest.json');
const changedPath = path.join(outputDir, 'changed-files.txt');
const acknowledgedPath = path.join(outputDir, 'acknowledged-resources.txt');
const statusPath = path.join(outputDir, 'generation-status.json');
const META_KEY = '__criticalcss';
const PENTHOUSE_CONCURRENCY = 5;
const CHECK_CONCURRENCY = 30;

let manifest = {};
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (_) {
  manifest = {};
}
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  manifest = {};
}

const previousMetadata = manifest[META_KEY] || {};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function normaliseResources(resources) {
  if (!Array.isArray(resources)) return [];

  const byId = new Map();
  resources.forEach(entry => {
    const resource = Number(entry && typeof entry === 'object' ? entry.resource : 0);
    const url = entry && typeof entry === 'object' ? String(entry.url || '').trim() : '';
    if (Number.isInteger(resource) && resource > 0 && /^https?:\/\//i.test(url)) {
      byId.set(resource, { resource, url });
    }
  });
  return [...byId.values()].sort((left, right) => left.resource - right.resource);
}

function getAboveFoldRoot($) {
  const header = $('header').first();
  const afterHeader = header.length
    ? header.nextAll('.container-fluid').first()
    : null;

  if (afterHeader && afterHeader.length) return afterHeader;
  const firstContainer = $('.container-fluid').first();
  return firstContainer.length ? firstContainer : $('body');
}

function extractClassNames(html) {
  const $ = cheerio.load(html);
  const result = new Set();
  const root = getAboveFoldRoot($);

  root.add(root.find('*')).each((_, element) => {
    const classes = $(element).attr('class');
    if (!classes) return;
    classes.split(/\s+/).filter(Boolean).forEach(name => result.add(name));
  });
  return [...result].sort();
}

function extractCssForClasses(css, classNames) {
  return classNames
    .map(name => {
      const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      return (css.match(new RegExp(`\\.${escaped}[^}{]*\\{[^}]*\\}`, 'g')) || [])
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

async function concurrent(items, limit, task) {
  const results = Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = await task(items[current]);
        } catch (error) {
          results[current] = null;
          console.error(`[ERROR] ${error.message || error}`);
        }
      }
    })
  );
  return results;
}

async function penthouseVariant(resource, url, viewportName, viewport) {
  const target = path.join(outputDir, `${resource}.${viewportName}.css`);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;

  try {
    const css = await penthouse({
      url,
      css: cssFile,
      width: viewport.width,
      height: viewport.height,
      timeout: 60000,
      renderWaitTime: 1000,
      blockJSRequests: true,
      puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        defaultViewport: viewport,
        headless: 'new'
      }
    });
    fs.writeFileSync(temporary, css);
    fs.renameSync(temporary, target);
    return path.basename(target);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch (_) {}
    console.error(
      `[Penthouse failed] ${resource}.${viewportName}: ${error.message || error}`
    );
    return null;
  }
}

async function generateResource(result) {
  const files = [];
  files.push(
    await penthouseVariant(result.resource, result.url, 'mobile', {
      width: 390,
      height: 844
    })
  );
  files.push(
    await penthouseVariant(result.resource, result.url, 'desktop', {
      width: 1300,
      height: 900
    })
  );

  return files.every(Boolean)
    ? { resource: result.resource, files }
    : null;
}

(async () => {
  const started = Date.now();
  fs.mkdirSync(outputDir, { recursive: true });

  const cssText = fs.readFileSync(cssFile, 'utf8');
  const stylesheetHash = sha256(cssText);
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  const resources = normaliseResources(queue.resources);
  if (resources.length !== (queue.resources || []).length) {
    throw new Error('Queue contains an invalid resource ID/URL entry.');
  }

  const checks = await concurrent(
    resources,
    CHECK_CONCURRENCY,
    async entry => {
      let html;
      try {
        const response = await fetch(entry.url, {
          signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        html = await response.text();
      } catch (error) {
        console.error(
          `[Page fetch failed] ${entry.resource}: ${error.message || error}`
        );
        return null;
      }

      const classNames = extractClassNames(html);
      const classHash = sha256(classNames.join('|'));
      const cssHash = sha256(extractCssForClasses(cssText, classNames));
      const previous = manifest[entry.resource] || {};

      return {
        ...entry,
        classHash,
        cssHash,
        needsRebuild:
          !previous.classHash ||
          !previous.cssHash ||
          previous.classHash !== classHash ||
          previous.cssHash !== cssHash
      };
    }
  );

  const changedFiles = [];
  const acknowledged = [];
  const rebuildQueue = checks.filter(result => result && result.needsRebuild);

  checks.forEach(result => {
    if (result && !result.needsRebuild) {
      acknowledged.push(result.resource);
    }
  });

  const generated = await concurrent(
    rebuildQueue,
    PENTHOUSE_CONCURRENCY,
    generateResource
  );
  const failedResources = [
    ...resources
      .filter((_, index) => !checks[index])
      .map(item => item.resource),
    ...rebuildQueue
      .filter((_, index) => !generated[index])
      .map(item => item.resource)
  ].filter((resource, index, values) => values.indexOf(resource) === index)
    .sort((left, right) => left - right);

  generated.filter(Boolean).forEach(item => {
    const source = rebuildQueue.find(result => result.resource === item.resource);
    changedFiles.push(...item.files);
    acknowledged.push(item.resource);
    manifest[item.resource] = {
      classHash: source.classHash,
      cssHash: source.cssHash,
      lastGenerated: new Date().toISOString()
    };
  });

  const uniqueAcknowledged = [...new Set(acknowledged)].sort((a, b) => a - b);
  const allResourcesCompleted =
    checks.every(Boolean) &&
    generated.filter(Boolean).length === rebuildQueue.length &&
    uniqueAcknowledged.length === resources.length;

  manifest[META_KEY] = {
    ...previousMetadata,
    ...(allResourcesCompleted ? { stylesheetHash } : {}),
    checkedAt: new Date().toISOString()
  };

  fs.writeFileSync(changedPath, changedFiles.join('\n'));
  fs.writeFileSync(acknowledgedPath, uniqueAcknowledged.join('\n'));
  fs.writeFileSync(
    statusPath,
    JSON.stringify(
      {
        fullRebuildCompleted: Boolean(queue.full_rebuild) && allResourcesCompleted,
        allResourcesCompleted,
        generatedFiles: changedFiles.length,
        acknowledgedResources: uniqueAcknowledged.length,
        candidateResources: resources.length,
        failedResources,
        durationSeconds: Math.round((Date.now() - started) / 1000)
      },
      null,
      2
    )
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Candidate resources: ${resources.length}`);
  console.log(`Generated files: ${changedFiles.length}`);
  console.log(`Acknowledged resources: ${uniqueAcknowledged.length}`);
  console.log(`Failed resources: ${failedResources.join(', ') || 'none'}`);

  if (!allResourcesCompleted) {
    process.exitCode = 1;
  }
})();
