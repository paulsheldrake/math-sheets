/**
 * Problem generation for the math sheet app. No DOM access, so it runs in the
 * browser (as window.MathSheets) and under Node for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MathSheets = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MINUS = '−';
  const TIMES = '×';
  const DIVIDE = '÷';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  function shuffle(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  function simplify(n, d) {
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  // Answers are shown as mixed numbers (7/4 -> 1 3/4); whole results collapse to a number.
  function toMixed(f) {
    const neg = f.n < 0;
    const n = Math.abs(f.n);
    const whole = Math.floor(n / f.d);
    const rem = n % f.d;
    if (rem === 0) return neg ? -whole : whole;
    return { w: whole, n: rem, d: f.d, neg };
  }

  function isFraction(v) {
    return typeof v === 'object' && v !== null && 'd' in v;
  }

  /** Plain-text form of a value, used for screen-reader labels and the answer key. */
  function plain(v) {
    if (typeof v === 'number') return v < 0 ? MINUS + Math.abs(v) : String(v);
    if (typeof v === 'string') return v;
    const frac = `${v.n}/${v.d}`;
    return (v.neg ? MINUS : '') + (v.w ? `${v.w} ${frac}` : frac);
  }

  function binary(op, left, symbol, right, answer, stackable) {
    const rightText = typeof right === 'number' && right < 0 ? `(${plain(right)})` : plain(right);
    return {
      op,
      left,
      symbol,
      right,
      answer,
      stackable: Boolean(stackable),
      text: `${plain(left)} ${symbol} ${rightText}`,
      answerText: plain(answer),
    };
  }

  function properFraction(rng, min, max) {
    const lo = Math.max(2, Math.min(min, max));
    const hi = Math.max(lo, Math.max(min, max));
    const d = randInt(rng, lo, hi);
    return { n: randInt(rng, 1, d - 1), d };
  }

  function compareFractions(a, b) {
    return a.n * b.d - b.n * a.d;
  }

  const ORDER_PATTERNS = [
    (a, b, c) => [`${a} + ${b} ${TIMES} ${c}`, a + b * c],
    (a, b, c) => [`${a} ${TIMES} ${b} + ${c}`, a * b + c],
    (a, b, c) => [`${a} ${TIMES} ${b} ${MINUS} ${c}`, a * b - c],
    (a, b, c) => [`${a} ${MINUS} ${b} ${TIMES} ${c}`, a - b * c],
    (a, b, c) => [`(${a} + ${b}) ${TIMES} ${c}`, (a + b) * c],
    (a, b, c) => [`${a} ${TIMES} (${b} ${MINUS} ${c})`, a * (b - c)],
    (a, b, c) => [`${a * b} ${DIVIDE} ${b} + ${c}`, a + c],
    (a, b, c) => [`${c} + ${a * b} ${DIVIDE} ${a}`, c + b],
    (a, b, c) => [`${a} + ${b} ${MINUS} ${c}`, a + b - c],
  ];

  /**
   * Each operation's range means something specific to it; `rangeHint` tells
   * the user what (operands, denominators...).
   */
  const OPERATIONS = [
    {
      id: 'addition',
      label: 'Addition',
      rangeHint: 'Each number',
      defaults: { min: 0, max: 20 },
      generate(rng, { min, max }) {
        const a = randInt(rng, min, max);
        const b = randInt(rng, min, max);
        return binary('addition', a, '+', b, a + b, true);
      },
    },
    {
      id: 'subtraction',
      label: 'Subtraction',
      rangeHint: 'Each number',
      defaults: { min: 0, max: 20 },
      generate(rng, { min, max }, settings) {
        let a = randInt(rng, min, max);
        let b = randInt(rng, min, max);
        if (!settings.allowNegatives && b > a) [a, b] = [b, a];
        return binary('subtraction', a, MINUS, b, a - b, true);
      },
    },
    {
      id: 'multiplication',
      label: 'Multiplication',
      rangeHint: 'Each factor',
      tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      defaults: { min: 0, max: 10 },
      generate(rng, { min, max, tables }) {
        if (!tables?.length) {
          const a = randInt(rng, min, max);
          const b = randInt(rng, min, max);
          return binary('multiplication', a, TIMES, b, a * b, true);
        }
        // Picked times tables fix one factor; the range sets the other. Either side, so both orders get practised.
        const fact = pick(rng, tables);
        const other = randInt(rng, min, max);
        const [a, b] = rng() < 0.5 ? [fact, other] : [other, fact];
        return binary('multiplication', a, TIMES, b, a * b, true);
      },
    },
    {
      id: 'division',
      label: 'Division',
      rangeHint: 'Divisor and quotient',
      defaults: { min: 1, max: 10 },
      generate(rng, { min, max }, settings) {
        const lo = Math.max(1, Math.min(min, max));
        const hi = Math.max(lo, max);
        const divisor = randInt(rng, lo, hi);
        const quotient = randInt(rng, Math.max(0, min), Math.max(0, max));
        if (settings.remainders && divisor > 1) {
          const remainder = randInt(rng, 1, divisor - 1);
          const dividend = divisor * quotient + remainder;
          return binary('division', dividend, DIVIDE, divisor, `${quotient} R ${remainder}`, true);
        }
        return binary('division', divisor * quotient, DIVIDE, divisor, quotient, true);
      },
    },
    {
      id: 'fractionAddSub',
      label: 'Fractions (+ −)',
      rangeHint: 'Denominators',
      defaults: { min: 2, max: 10 },
      generate(rng, { min, max }, settings) {
        let a = properFraction(rng, min, max);
        let b = properFraction(rng, min, max);
        const add = rng() < 0.5;
        if (!add && !settings.allowNegatives && compareFractions(a, b) < 0) [a, b] = [b, a];
        const result = simplify(add ? a.n * b.d + b.n * a.d : a.n * b.d - b.n * a.d, a.d * b.d);
        return binary('fractionAddSub', a, add ? '+' : MINUS, b, toMixed(result), false);
      },
    },
    {
      id: 'fractionMulDiv',
      label: `Fractions (${TIMES} ${DIVIDE})`,
      rangeHint: 'Denominators',
      defaults: { min: 2, max: 10 },
      generate(rng, { min, max }) {
        const a = properFraction(rng, min, max);
        const b = properFraction(rng, min, max);
        const multiply = rng() < 0.5;
        const result = multiply ? simplify(a.n * b.n, a.d * b.d) : simplify(a.n * b.d, a.d * b.n);
        return binary('fractionMulDiv', a, multiply ? TIMES : DIVIDE, b, toMixed(result), false);
      },
    },
    {
      id: 'decimals',
      label: 'Decimals (+ −)',
      rangeHint: 'Whole-number part',
      defaults: { min: 0, max: 20 },
      generate(rng, { min, max }, settings) {
        // Work in integer hundredths/tenths to avoid floating-point answers like 0.30000000000000004.
        const places = pick(rng, [1, 2]);
        const scale = 10 ** places;
        const lo = Math.min(min, max) * scale;
        const hi = Math.max(min, max) * scale + scale - 1;
        let a = randInt(rng, lo, hi);
        let b = randInt(rng, lo, hi);
        const add = rng() < 0.5;
        if (!add && !settings.allowNegatives && b > a) [a, b] = [b, a];
        const fmt = (n) => (n < 0 ? MINUS : '') + (Math.abs(n) / scale).toFixed(places);
        return binary('decimals', fmt(a), add ? '+' : MINUS, fmt(b), fmt(add ? a + b : a - b), true);
      },
    },
    {
      id: 'integers',
      label: 'Negative numbers',
      rangeHint: 'Each number',
      defaults: { min: -20, max: 20 },
      generate(rng, { min, max }) {
        const kind = pick(rng, ['+', MINUS, TIMES, DIVIDE]);
        if (kind === DIVIDE) {
          let divisor = 0;
          // A range of only 0 has no valid divisor, so stop trying rather than loop forever.
          for (let attempt = 0; attempt < 25 && divisor === 0; attempt++) divisor = randInt(rng, min, max);
          if (divisor === 0) divisor = 1;
          const quotient = randInt(rng, min, max);
          return binary('integers', divisor * quotient, DIVIDE, divisor, quotient, false);
        }
        const a = randInt(rng, min, max);
        const b = randInt(rng, min, max);
        const answer = kind === '+' ? a + b : kind === MINUS ? a - b : a * b;
        return binary('integers', a, kind, b, answer, true);
      },
    },
    {
      id: 'orderOfOperations',
      label: 'Order of operations',
      rangeHint: 'Each number',
      defaults: { min: 1, max: 12 },
      generate(rng, { min, max }, settings) {
        const lo = Math.max(1, Math.min(min, max));
        const hi = Math.max(lo, max);
        let expr;
        let answer;
        for (let attempt = 0; attempt < 30; attempt++) {
          const pattern = pick(rng, ORDER_PATTERNS);
          [expr, answer] = pattern(randInt(rng, lo, hi), randInt(rng, lo, hi), randInt(rng, lo, hi));
          if (settings.allowNegatives || answer >= 0) break;
        }
        if (!settings.allowNegatives && answer < 0) {
          const [a, b, c] = [randInt(rng, lo, hi), randInt(rng, lo, hi), randInt(rng, lo, hi)];
          [expr, answer] = ORDER_PATTERNS[0](a, b, c);
        }
        return { op: 'orderOfOperations', expr, stackable: false, answer, text: expr, answerText: plain(answer) };
      },
    },
  ];

  const OPERATIONS_BY_ID = Object.fromEntries(OPERATIONS.map((op) => [op.id, op]));

  /**
   * Starting points per grade, following the BC Mathematics curriculum
   * (curriculum.gov.bc.ca). Addition ranges are per number, so they are half
   * the curriculum's "to N" so sums stay within N. Users can adjust anything
   * after applying one.
   */
  const GRADE_PRESETS = {
    // Addition and subtraction to 20.
    1: { ops: { addition: [0, 10], subtraction: [0, 20] } },
    // Addition and subtraction to 100.
    2: { ops: { addition: [0, 50], subtraction: [0, 100] } },
    // Addition and subtraction to 1000; multiplication and division concepts (no fact memorization yet).
    3: { ops: { addition: [0, 500], subtraction: [0, 1000], multiplication: [0, 5], division: [1, 5] } },
    // To 10 000; multiplication and division facts to 100; decimal addition and subtraction to hundredths.
    4: { ops: { addition: [0, 5000], subtraction: [0, 10000], multiplication: [0, 10], division: [1, 10], decimals: [0, 10] } },
    // To 1 000 000; facts to 100; division with remainders; decimal addition and subtraction.
    5: {
      ops: { addition: [0, 500000], subtraction: [0, 1000000], multiplication: [0, 10], division: [1, 10], decimals: [0, 100] },
      options: { remainders: true },
    },
    // Facts to 100; order of operations with whole numbers (brackets, no exponents).
    6: { ops: { multiplication: [0, 10], division: [1, 10], orderOfOperations: [1, 12] } },
    // Operations with integers, including order of operations.
    7: { ops: { integers: [-20, 20], orderOfOperations: [1, 20] }, options: { allowNegatives: true } },
    // Operations with fractions.
    8: { ops: { fractionAddSub: [2, 12], fractionMulDiv: [2, 12] } },
  };

  const DEFAULT_GRADE = '3';

  const DEFAULT_SETTINGS = { allowNegatives: false, remainders: false };

  /**
   * @param {Array<{id: string, min: number, max: number}>} selections
   * @param {number} count Problems to generate.
   * @param {object} settings See DEFAULT_SETTINGS.
   * @param {() => number} rng
   */
  function generateProblems(selections, count, settings, rng) {
    if (!selections.length) throw new Error('Select at least one operation.');
    const opts = { ...DEFAULT_SETTINGS, ...settings };
    const order = shuffle(rng, Array.from({ length: count }, (_, i) => selections[i % selections.length]));
    const seen = new Set();
    return order.map((sel) => {
      const op = OPERATIONS_BY_ID[sel.id];
      if (!op) throw new Error(`Unknown operation: ${sel.id}`);
      let problem;
      // Small ranges can't always avoid repeats, so give up after a few tries.
      for (let attempt = 0; attempt < 25; attempt++) {
        problem = op.generate(rng, sel, opts);
        if (!seen.has(problem.text)) break;
      }
      seen.add(problem.text);
      return problem;
    });
  }

  function generateSheets({ selections, count, pages, settings, seed }) {
    const rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 32));
    return Array.from({ length: pages }, () => generateProblems(selections, count, settings, rng));
  }

  return {
    OPERATIONS,
    OPERATIONS_BY_ID,
    GRADE_PRESETS,
    DEFAULT_GRADE,
    DEFAULT_SETTINGS,
    generateProblems,
    generateSheets,
    mulberry32,
    plain,
    isFraction,
    simplify,
    toMixed,
  };
});
