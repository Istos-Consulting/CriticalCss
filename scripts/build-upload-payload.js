#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [directory, queueFile, changedFile, acknowledgedFile, statusFile] =
  process.argv.slice(2);

if (!directory || !queueFile || !changedFile || !acknowledgedFile || !statusFile) {
  throw new Error(
    'Usage: build-upload-payload.js <critical-css-directory> <queue.json> ' +
    '<changed-files.txt> <acknowledged-resources.txt> <generation-status.json>'
  );
}

const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
const changed = fs.readFileSync(changedFile, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);
const acknowledged = fs.readFileSync(acknowledgedFile, 'utf8')
  .split(/\r?\n/)
  .map(Number)
  .filter(resource => resource > 0);
const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
const updates = new Map();

changed.forEach(filename => {
  const match = filename.match(/^(\d+)\.([A-Za-z0-9_-]{1,40})\.css$/);
  if (!match) return;

  const resource = Number(match[1]);
  const css = fs.readFileSync(path.join(directory, filename), 'utf8');
  if (!updates.has(resource)) {
    updates.set(resource, { resource, variants: [] });
  }
  updates.get(resource).variants.push({
    viewport: match[2],
    css
  });
});

process.stdout.write(JSON.stringify({
  updates: [...updates.values()],
  full_rebuild_completed: Boolean(status.fullRebuildCompleted),
  css_rebuild_completed: Boolean(queue.css_rebuild && status.allResourcesCompleted),
  acknowledged_resources: [...new Set(acknowledged)],
  queue_updated_at: queue.updated_at || null
}));
