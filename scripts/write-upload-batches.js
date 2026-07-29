#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [payloadFile, outputDirectory, maximumBytesArgument] = process.argv.slice(2);
const maximumBytes = Number(maximumBytesArgument || 524288);

if (!payloadFile || !outputDirectory || !Number.isInteger(maximumBytes) || maximumBytes < 1024) {
  throw new Error(
    'Usage: write-upload-batches.js <payload.json> <output-directory> [maximum-bytes]'
  );
}

const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
if (!Array.isArray(payload.updates)) {
  throw new Error('The ingestion payload must contain an updates array.');
}

const batches = [];
let current = [];

payload.updates.forEach(update => {
  const candidate = [...current, update];
  const candidateBytes = Buffer.byteLength(JSON.stringify({ updates: candidate }), 'utf8');

  if (current.length > 0 && candidateBytes > maximumBytes) {
    batches.push(current);
    current = [update];
    return;
  }

  current = candidate;
});

if (current.length > 0 || batches.length === 0) {
  batches.push(current);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const width = Math.max(3, String(batches.length).length);

batches.forEach((updates, index) => {
  const finalBatch = index === batches.length - 1;
  const batch = {
    updates,
    full_rebuild_completed: finalBatch
      ? Boolean(payload.full_rebuild_completed)
      : false,
    acknowledged_resources: finalBatch && Array.isArray(payload.acknowledged_resources)
      ? payload.acknowledged_resources
      : [],
    queue_updated_at: finalBatch
      ? (payload.queue_updated_at || null)
      : null
  };
  const filename = `${String(index + 1).padStart(width, '0')}.json`;
  fs.writeFileSync(path.join(outputDirectory, filename), JSON.stringify(batch));
});

process.stdout.write(JSON.stringify({
  batches: batches.length,
  updates: payload.updates.length,
  maximum_bytes: maximumBytes
}) + '\n');
