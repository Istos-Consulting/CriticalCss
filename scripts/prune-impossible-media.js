const cssTree = require('css-tree');
const cssMediaQuery = require('css-mediaquery');

const VARIANT_RANGES = {
  mobile: { minimum: 0, maximum: 767.98 },
  desktop: { minimum: 768, maximum: Number.POSITIVE_INFINITY }
};

function lengthToPixels(value) {
  const match = String(value || '').trim().match(
    /^(-?(?:\d+|\d*\.\d+))(px|em|rem|cm|mm|in|pt|pc)?$/i
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  const factors = {
    px: 1,
    em: 16,
    rem: 16,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    in: 96,
    pt: 96 / 72,
    pc: 16
  };
  return amount * factors[unit];
}

function queryCanIntersect(query, range) {
  // Preserve syntax whose inverse/medium semantics cannot be reduced safely to
  // a simple viewport-width interval.
  if (query.inverse) return true;
  if (query.type === 'print') return false;
  if (query.type !== 'all' && query.type !== 'screen') return true;

  let minimum = 0;
  let maximum = Number.POSITIVE_INFINITY;

  for (const expression of query.expressions) {
    if (!['width', 'device-width'].includes(expression.feature)) continue;

    const pixels = lengthToPixels(expression.value);
    if (pixels === null) return true;

    if (expression.modifier === 'min') {
      minimum = Math.max(minimum, pixels);
    } else if (expression.modifier === 'max') {
      maximum = Math.min(maximum, pixels);
    } else if (!expression.modifier) {
      minimum = Math.max(minimum, pixels);
      maximum = Math.min(maximum, pixels);
    } else {
      return true;
    }
  }

  return minimum <= maximum &&
    maximum >= range.minimum &&
    minimum <= range.maximum;
}

function mediaCanIntersect(mediaQuery, range) {
  let queries;
  try {
    queries = cssMediaQuery.parse(mediaQuery);
  } catch (_) {
    return true;
  }
  return queries.some(query => queryCanIntersect(query, range));
}

function pruneImpossibleMediaQueries(css, viewportName) {
  const range = VARIANT_RANGES[viewportName];
  if (!range) {
    throw new Error(`Unknown Critical CSS viewport: ${viewportName}`);
  }

  let ast;
  try {
    ast = cssTree.parse(css);
  } catch (_) {
    return { css, removed: 0 };
  }

  let removed = 0;
  cssTree.walk(ast, {
    visit: 'Atrule',
    enter(node, item, list) {
      if (cssTree.keyword(node.name).name !== 'media' || !node.prelude) return;

      const mediaQuery = cssTree.generate(node.prelude);
      if (!mediaCanIntersect(mediaQuery, range)) {
        list.remove(item);
        removed += 1;
      }
    }
  });

  return {
    css: cssTree.generate(ast),
    removed
  };
}

module.exports = {
  mediaCanIntersect,
  pruneImpossibleMediaQueries
};
