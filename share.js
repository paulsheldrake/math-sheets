/**
 * Converts form state to and from a URL query string so a configuration
 * (and, with the seed, the exact problems) can be shared as a link.
 * No DOM access, so it runs in the browser (as window.MathSheetsShare) and under Node for tests.
 *
 * Each enabled operation is its own parameter: `addition=0_500`, or with
 * times tables `multiplication=0_10_2.3.5.9`. `_` separates values so
 * negative ranges (`integers=-20_20`) stay readable.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MathSheetsShare = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FIELDS = ['grade', 'count', 'pages', 'layout', 'paper'];
  const FLAGS = { name: 'showName', score: 'showScore', negatives: 'allowNegatives', remainders: 'remainders', key: 'answerKey' };
  const CHOICES = { layout: ['horizontal', 'vertical'], paper: ['letter', 'a4'] };

  /**
   * @param {object} state Form state, as read by app.js.
   * @param {number} seed
   * @param {Array<{id: string}>} operations
   */
  function encodeState(state, seed, operations) {
    const params = new URLSearchParams();
    for (const op of operations) {
      const s = state.ops[op.id];
      if (!s?.on) continue;
      const parts = [s.min, s.max];
      if (s.tables?.length) parts.push(s.tables.join('.'));
      params.set(op.id, parts.join('_'));
    }
    for (const name of FIELDS) {
      if (state[name] !== undefined && state[name] !== '') params.set(name, state[name]);
    }
    for (const [param, key] of Object.entries(FLAGS)) params.set(param, state[key] ? '1' : '0');
    params.set('seed', String(seed));
    return params.toString();
  }

  function intOrUndefined(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Returns null when the query has no worksheet settings, so a plain visit
   * falls back to saved settings. Unknown or malformed values are dropped.
   */
  function decodeState(query, operations) {
    const params = new URLSearchParams(query);
    if (!operations.some((op) => params.has(op.id))) return null;

    const ops = {};
    for (const op of operations) {
      const value = params.get(op.id);
      if (value === null) {
        ops[op.id] = { on: false, ...op.defaults, tables: [] };
        continue;
      }
      const [min, max, tables] = value.split('_');
      ops[op.id] = {
        on: true,
        min: intOrUndefined(min) ?? op.defaults.min,
        max: intOrUndefined(max) ?? op.defaults.max,
        tables: (tables || '')
          .split('.')
          .map(Number)
          .filter((n) => op.tables?.includes(n)),
      };
    }

    const state = { ops };
    const grade = params.get('grade');
    if (grade !== null) state.grade = /^[1-8]$/.test(grade) ? grade : '';
    for (const name of ['count', 'pages']) {
      const n = intOrUndefined(params.get(name));
      if (n !== undefined) state[name] = n;
    }
    for (const [name, allowed] of Object.entries(CHOICES)) {
      if (allowed.includes(params.get(name))) state[name] = params.get(name);
    }
    for (const [param, key] of Object.entries(FLAGS)) {
      if (params.has(param)) state[key] = params.get(param) === '1';
    }
    const seed = intOrUndefined(params.get('seed'));
    return { state, seed: seed !== undefined && seed >= 0 && seed < 2 ** 32 ? seed : undefined };
  }

  return { encodeState, decodeState };
});
