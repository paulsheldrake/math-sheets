const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OPERATIONS,
  OPERATIONS_BY_ID,
  GRADE_PRESETS,
  DEFAULT_GRADE,
  generateProblems,
  generateSheets,
  mulberry32,
  simplify,
  toMixed,
} = require('../generator.js');

const SAMPLES = 500;

function many(id, range, settings = {}) {
  const rng = mulberry32(42);
  const op = OPERATIONS_BY_ID[id];
  return Array.from({ length: SAMPLES }, () => op.generate(rng, range, { allowNegatives: false, remainders: false, ...settings }));
}

function fractionValue(v) {
  if (typeof v === 'number') return v;
  const sign = v.neg ? -1 : 1;
  return sign * ((v.w || 0) + v.n / v.d);
}

function evalExpression(text) {
  const js = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  assert.match(js, /^[\d\s+\-*/()]+$/);
  return Function(`"use strict"; return (${js});`)();
}

test('addition stays within range and is correct', () => {
  for (const p of many('addition', { min: 0, max: 100 })) {
    assert.ok(p.left >= 0 && p.left <= 100);
    assert.ok(p.right >= 0 && p.right <= 100);
    assert.equal(p.answer, p.left + p.right);
  }
});

test('subtraction has no negative answers unless allowed', () => {
  for (const p of many('subtraction', { min: 0, max: 50 })) {
    assert.ok(p.answer >= 0);
    assert.equal(p.answer, p.left - p.right);
  }
  const allowed = many('subtraction', { min: 0, max: 50 }, { allowNegatives: true });
  assert.ok(allowed.some((p) => p.answer < 0));
});

test('multiplication is correct', () => {
  for (const p of many('multiplication', { min: 0, max: 12 })) {
    assert.equal(p.answer, p.left * p.right);
  }
});

test('multiplication with picked times tables uses only those tables', () => {
  const tables = [2, 3, 5, 9];
  const problems = many('multiplication', { min: 0, max: 10, tables });
  for (const p of problems) {
    assert.equal(p.answer, p.left * p.right);
    const fact = tables.includes(p.left) ? p.right : p.left;
    assert.ok(tables.includes(p.left) || tables.includes(p.right), p.text);
    assert.ok(fact >= 0 && fact <= 10, p.text);
  }
  for (const n of tables) assert.ok(problems.some((p) => p.left === n || p.right === n), `table ${n}`);
  assert.ok(problems.some((p) => tables.includes(p.left)) && problems.some((p) => tables.includes(p.right)));
});

test('division is exact by default and never divides by zero', () => {
  for (const p of many('division', { min: 0, max: 10 })) {
    assert.ok(p.right >= 1);
    assert.equal(p.left / p.right, p.answer);
  }
});

test('division with remainders reports quotient and remainder', () => {
  for (const p of many('division', { min: 2, max: 10 }, { remainders: true })) {
    const [q, r] = p.answer.split(' R ').map(Number);
    assert.equal(p.right * q + r, p.left);
    assert.ok(r > 0 && r < p.right);
  }
});

test('fraction add/subtract answers are simplified and correct', () => {
  for (const p of many('fractionAddSub', { min: 2, max: 12 })) {
    const a = p.left.n / p.left.d;
    const b = p.right.n / p.right.d;
    const expected = p.symbol === '+' ? a + b : a - b;
    assert.ok(Math.abs(fractionValue(p.answer) - expected) < 1e-9);
    assert.ok(expected >= 0);
    if (typeof p.answer === 'object') assert.equal(simplify(p.answer.n, p.answer.d).d, p.answer.d);
  }
});

test('fraction multiply/divide answers are correct', () => {
  for (const p of many('fractionMulDiv', { min: 2, max: 12 })) {
    const a = p.left.n / p.left.d;
    const b = p.right.n / p.right.d;
    const expected = p.symbol === '×' ? a * b : a / b;
    assert.ok(Math.abs(fractionValue(p.answer) - expected) < 1e-9);
  }
});

test('fraction denominators respect a minimum of 2', () => {
  for (const p of many('fractionAddSub', { min: 0, max: 1 })) {
    assert.equal(p.left.d, 2);
    assert.equal(p.right.d, 2);
  }
});

test('decimal answers have no floating-point noise', () => {
  for (const p of many('decimals', { min: 0, max: 100 })) {
    const a = Number(p.left);
    const b = Number(p.right);
    const expected = p.symbol === '+' ? a + b : a - b;
    assert.ok(Math.abs(Number(p.answer) - expected) < 1e-9);
    assert.match(p.answer, /^\d+\.\d{1,2}$/);
  }
});

test('negative-number problems are correct', () => {
  for (const p of many('integers', { min: -20, max: 20 })) {
    // + 0 folds -0 (from e.g. 0 ÷ −5) into 0.
    assert.equal(evalExpression(p.text) + 0, p.answer + 0);
    // Long division with negatives isn't taught, so only ÷ stays inline.
    assert.equal(p.stackable, p.symbol !== '÷');
  }
});

test('negative-number division with a zero-only range still finishes', () => {
  for (const p of many('integers', { min: 0, max: 0 })) {
    if (p.symbol === '÷') assert.equal(p.right, 1);
  }
});

test('order of operations answers match standard precedence and are non-negative', () => {
  for (const p of many('orderOfOperations', { min: 1, max: 20 })) {
    assert.equal(evalExpression(p.expr), p.answer);
    assert.ok(Number.isInteger(p.answer));
    assert.ok(p.answer >= 0);
  }
});

test('toMixed converts improper fractions', () => {
  assert.deepEqual(toMixed({ n: 7, d: 4 }), { w: 1, n: 3, d: 4, neg: false });
  assert.equal(toMixed({ n: 8, d: 4 }), 2);
  assert.equal(toMixed({ n: 0, d: 5 }), 0);
});

test('generateProblems returns the requested count, split across operations', () => {
  const selections = [
    { id: 'addition', min: 0, max: 100 },
    { id: 'multiplication', min: 0, max: 12 },
  ];
  const problems = generateProblems(selections, 30, {}, mulberry32(1));
  assert.equal(problems.length, 30);
  assert.equal(problems.filter((p) => p.op === 'addition').length, 15);
  assert.equal(problems.filter((p) => p.op === 'multiplication').length, 15);
});

test('generateProblems avoids duplicates when the range allows it', () => {
  const problems = generateProblems([{ id: 'addition', min: 0, max: 100 }], 60, {}, mulberry32(7));
  assert.equal(new Set(problems.map((p) => p.text)).size, 60);
});

test('generateProblems still fills the page when the range is too small for unique problems', () => {
  const problems = generateProblems([{ id: 'addition', min: 1, max: 1 }], 10, {}, mulberry32(7));
  assert.equal(problems.length, 10);
});

test('generateProblems rejects empty and unknown selections', () => {
  assert.throws(() => generateProblems([], 10, {}, mulberry32(1)), /at least one/);
  assert.throws(() => generateProblems([{ id: 'nope', min: 0, max: 1 }], 1, {}, mulberry32(1)), /Unknown/);
});

test('generateSheets builds the requested pages and is deterministic for a seed', () => {
  const args = { selections: [{ id: 'subtraction', min: 0, max: 20 }], count: 12, pages: 3, settings: {}, seed: 99 };
  const a = generateSheets(args);
  const b = generateSheets(args);
  assert.equal(a.length, 3);
  assert.ok(a.every((page) => page.length === 12));
  assert.deepEqual(a, b);
});

test('every grade preset references real operations', () => {
  for (const preset of Object.values(GRADE_PRESETS)) {
    assert.ok(Object.keys(preset.ops).length > 0);
    for (const id of Object.keys(preset.ops)) assert.ok(OPERATIONS_BY_ID[id], id);
  }
  assert.deepEqual(Object.keys(GRADE_PRESETS), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.ok(GRADE_PRESETS[DEFAULT_GRADE]);
});

test('BC grade 3 preset covers addition and subtraction to 1000 plus multiplication and division concepts', () => {
  const { ops } = GRADE_PRESETS[3];
  assert.deepEqual(Object.keys(ops).sort(), ['addition', 'division', 'multiplication', 'subtraction']);
  assert.ok(ops.addition[1] * 2 <= 1000);
  assert.equal(ops.subtraction[1], 1000);
});

test('every operation produces plain text and an answer', () => {
  const rng = mulberry32(3);
  for (const op of OPERATIONS) {
    const p = op.generate(rng, op.defaults, { allowNegatives: false, remainders: false });
    assert.equal(typeof p.text, 'string');
    assert.equal(typeof p.answerText, 'string');
    assert.ok(p.text.length > 0 && p.answerText.length > 0);
  }
});
