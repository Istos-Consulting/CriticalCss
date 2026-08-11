const assert = require('assert');
const {
  mediaCanIntersect,
  pruneImpossibleMediaQueries
} = require('./prune-impossible-media');

assert.strictEqual(mediaCanIntersect('(min-width:992px)', {
  minimum: 0,
  maximum: 767.98
}), false);
assert.strictEqual(mediaCanIntersect('(max-width:767.98px)', {
  minimum: 768,
  maximum: Number.POSITIVE_INFINITY
}), false);
assert.strictEqual(mediaCanIntersect('(min-width:1400px)', {
  minimum: 768,
  maximum: Number.POSITIVE_INFINITY
}), true);
assert.strictEqual(mediaCanIntersect('(max-width:991px)', {
  minimum: 768,
  maximum: Number.POSITIVE_INFINITY
}), true);
assert.strictEqual(mediaCanIntersect(
  '(min-width:992px), (orientation:landscape)',
  { minimum: 0, maximum: 767.98 }
), true);

const input = [
  '@media (min-width:992px){.desktop-only{display:block}}',
  '@media (max-width:767.98px){.mobile-only{display:block}}',
  '@media (max-width:991px){.tablet-and-down{display:block}}',
  '@media print{.print-only{display:block}}',
  '.always{display:block}'
].join('');

const mobile = pruneImpossibleMediaQueries(input, 'mobile');
assert.strictEqual(mobile.removed, 2);
assert.ok(!mobile.css.includes('desktop-only'));
assert.ok(mobile.css.includes('mobile-only'));
assert.ok(mobile.css.includes('tablet-and-down'));
assert.ok(!mobile.css.includes('print-only'));

const desktop = pruneImpossibleMediaQueries(input, 'desktop');
assert.strictEqual(desktop.removed, 2);
assert.ok(desktop.css.includes('desktop-only'));
assert.ok(!desktop.css.includes('mobile-only'));
assert.ok(desktop.css.includes('tablet-and-down'));
assert.ok(!desktop.css.includes('print-only'));

console.log('Impossible media-query pruning tests passed.');
