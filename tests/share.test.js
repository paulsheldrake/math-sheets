const test = require('node:test');
const assert = require('node:assert/strict');
const { OPERATIONS } = require('../generator.js');
const { encodeState, decodeState } = require('../share.js');

function formState(overrides = {}) {
  const ops = Object.fromEntries(OPERATIONS.map((op) => [op.id, { on: false, ...op.defaults, ...(op.tables ? { tables: [] } : {}) }]));
  return {
    grade: '3',
    ops,
    count: 10,
    pages: 1,
    layout: 'vertical',
    paper: 'letter',
    allowNegatives: false,
    remainders: false,
    answerKey: false,
    showName: true,
    showScore: true,
    ...overrides,
  };
}

test('only enabled operations go in the link, with tables and negative ranges readable', () => {
  const state = formState();
  state.ops.multiplication = { on: true, min: 0, max: 10, tables: [2, 3, 5, 9] };
  state.ops.integers = { on: true, min: -20, max: 20 };
  const params = new URLSearchParams(encodeState(state, 42, OPERATIONS));
  assert.equal(params.get('multiplication'), '0_10_2.3.5.9');
  assert.equal(params.get('integers'), '-20_20');
  assert.equal(params.has('addition'), false);
  assert.equal(params.get('seed'), '42');
  assert.match(encodeState(state, 42, OPERATIONS), /multiplication=0_10_2\.3\.5\.9/);
});

test('a link round-trips back to the same settings and seed', () => {
  const state = formState({ count: 30, pages: 2, layout: 'horizontal', paper: 'a4', answerKey: true, showScore: false, remainders: true });
  state.ops.addition = { on: true, min: 0, max: 500 };
  state.ops.multiplication = { on: true, min: 1, max: 12, tables: [7, 8] };
  const { state: decoded, seed } = decodeState(encodeState(state, 123456, OPERATIONS), OPERATIONS);
  assert.equal(seed, 123456);
  for (const key of ['grade', 'count', 'pages', 'layout', 'paper', 'answerKey', 'showScore', 'showName', 'remainders', 'allowNegatives']) {
    assert.equal(decoded[key], state[key], key);
  }
  assert.deepEqual(decoded.ops.addition, { on: true, min: 0, max: 500, tables: [] });
  assert.deepEqual(decoded.ops.multiplication, { on: true, min: 1, max: 12, tables: [7, 8] });
  assert.equal(decoded.ops.subtraction.on, false);
});

test('a query without operations is not a shared link', () => {
  assert.equal(decodeState('', OPERATIONS), null);
  assert.equal(decodeState('?utm_source=email', OPERATIONS), null);
});

test('malformed values fall back instead of breaking the sheet', () => {
  const { state, seed } = decodeState('?addition=abc_&multiplication=0_10_2.99.x&layout=sideways&paper=a3&grade=12&count=lots&seed=-5', OPERATIONS);
  assert.deepEqual(state.ops.addition, { on: true, ...OPERATIONS[0].defaults, tables: [] });
  assert.deepEqual(state.ops.multiplication.tables, [2]);
  assert.equal(state.layout, undefined);
  assert.equal(state.paper, undefined);
  assert.equal(state.grade, '');
  assert.equal(state.count, undefined);
  assert.equal(seed, undefined);
});
