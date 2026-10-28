(function () {
  'use strict';

  const { OPERATIONS, GRADE_PRESETS, DEFAULT_GRADE, generateSheets, plain, isFraction } = window.MathSheets;

  const STORAGE_KEY = 'math-sheets:settings';
  const MAX_COUNT = 60;
  const MAX_PAGES = 20;
  const PAPER = {
    letter: { w: 8.5, h: 11, css: 'letter' },
    a4: { w: 8.27, h: 11.69, css: 'A4' },
  };
  // Header block height in points, so problem rows can be sized to fill the rest of the page.
  const HEADER_PT = 50;

  const form = document.getElementById('controls');
  const gradeSelect = document.getElementById('grade');
  const opsContainer = document.getElementById('operations');
  const preview = document.getElementById('preview');
  const errorEl = document.getElementById('error');
  const pageStyle = document.getElementById('page-style');

  const inputClass =
    'w-16 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function buildControls() {
    for (let g = 1; g <= 8; g++) gradeSelect.add(new Option(`Grade ${g}`, String(g)));

    opsContainer.innerHTML = OPERATIONS.map(
      (op) => `
      <div class="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-2">
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" name="op-${op.id}" class="mt-0.5 h-4 w-4 accent-indigo-600">
          <span>${op.label}<span class="block text-xs text-slate-600">${op.rangeHint}</span></span>
        </label>
        <label class="flex items-center gap-1 text-xs text-slate-600">
          <span>From</span><span class="sr-only">${op.label} minimum</span>
          <input type="number" name="min-${op.id}" value="${op.defaults.min}" class="${inputClass}">
        </label>
        <label class="flex items-center gap-1 text-xs text-slate-600">
          <span>to</span><span class="sr-only">${op.label} maximum</span>
          <input type="number" name="max-${op.id}" value="${op.defaults.max}" class="${inputClass}">
        </label>
      </div>`
    ).join('');
  }

  function intOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function readForm() {
    const f = form.elements;
    const ops = {};
    for (const op of OPERATIONS) {
      ops[op.id] = {
        on: f[`op-${op.id}`].checked,
        min: intOr(f[`min-${op.id}`].value, op.defaults.min),
        max: intOr(f[`max-${op.id}`].value, op.defaults.max),
      };
    }
    return {
      grade: f.grade.value,
      ops,
      count: clamp(intOr(f.count.value, 20), 1, MAX_COUNT),
      pages: clamp(intOr(f.pages.value, 1), 1, MAX_PAGES),
      layout: f.layout.value,
      paper: f.paper.value in PAPER ? f.paper.value : 'letter',
      allowNegatives: f.allowNegatives.checked,
      remainders: f.remainders.checked,
      answerKey: f.answerKey.checked,
      showName: f.showName.checked,
      showScore: f.showScore.checked,
    };
  }

  function applyState(state) {
    const f = form.elements;
    for (const op of OPERATIONS) {
      const s = state.ops?.[op.id];
      if (!s) continue;
      f[`op-${op.id}`].checked = Boolean(s.on);
      f[`min-${op.id}`].value = s.min;
      f[`max-${op.id}`].value = s.max;
    }
    for (const name of ['grade', 'count', 'pages', 'layout', 'paper']) {
      if (state[name] !== undefined) f[name].value = state[name];
    }
    for (const name of ['allowNegatives', 'remainders', 'answerKey', 'showName', 'showScore']) {
      if (state[name] !== undefined) f[name].checked = Boolean(state[name]);
    }
  }

  function applyPreset(grade) {
    const preset = GRADE_PRESETS[grade];
    if (!preset) return;
    const f = form.elements;
    for (const op of OPERATIONS) {
      const range = preset.ops[op.id];
      f[`op-${op.id}`].checked = Boolean(range);
      if (range) {
        f[`min-${op.id}`].value = range[0];
        f[`max-${op.id}`].value = range[1];
      }
    }
    f.layout.value = Number(grade) <= 5 ? 'vertical' : 'horizontal';
    f.allowNegatives.checked = Boolean(preset.options?.allowNegatives);
    f.remainders.checked = Boolean(preset.options?.remainders);
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage can be unavailable (private mode, file:// in some browsers); settings just won't persist.
    }
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function valueHtml(v) {
    if (typeof v === 'number' || typeof v === 'string') return escapeHtml(plain(v));
    const sign = v.neg ? '−' : '';
    return `<span class="whitespace-nowrap">${sign}${v.w || ''}<span class="frac"><span>${v.n}</span><span>${v.d}</span></span></span>`;
  }

  function rightHtml(v) {
    return typeof v === 'number' && v < 0 ? `(${valueHtml(v)})` : valueHtml(v);
  }

  // The closing bracket hangs past the column so ones digits stay aligned with the number above.
  function stackedRightHtml(v) {
    return typeof v === 'number' && v < 0 ? `(${valueHtml(v)}<span class="hang">)</span>` : valueHtml(v);
  }

  function problemHtml(p, vertical) {
    if (vertical && p.stackable) {
      if (p.op === 'division') {
        return `<span class="longdiv" aria-hidden="true"><span>${valueHtml(p.right)}</span><span>${valueHtml(p.left)}</span></span>`;
      }
      return `<span class="stack" aria-hidden="true"><span></span><span>${valueHtml(p.left)}</span><span>${p.symbol}</span><span>${stackedRightHtml(p.right)}</span></span>`;
    }
    let expr;
    if (p.expr) expr = escapeHtml(p.expr);
    else if (p.symbol) expr = `${valueHtml(p.left)} ${p.symbol} ${rightHtml(p.right)}`;
    else expr = valueHtml(p.left);
    // Blank stays inline with the expression so its underline sits on the text baseline.
    return `<span class="whitespace-nowrap" aria-hidden="true">${expr} = <span class="blank"></span></span>`;
  }

  // Rough rendered widths in ems, so columns can be sized to what's actually in them.
  const MARKER_EM = 1.7;
  const COLUMN_GAP_EM = 1.25;

  function valueEm(v) {
    if (isFraction(v)) {
      const whole = v.w ? String(v.w).length * 0.6 : 0;
      return (v.neg ? 0.6 : 0) + whole + Math.max(String(v.n).length, String(v.d).length) * 0.51 + 0.5;
    }
    return plain(v).length * 0.6;
  }

  function problemEm(p, stacked) {
    if (stacked && p.op === 'division') return MARKER_EM + 1.3 + valueEm(p.left) + valueEm(p.right);
    const parens = typeof p.right === 'number' && p.right < 0 ? 0.7 : 0;
    if (stacked) return MARKER_EM + 1.8 + Math.max(valueEm(p.left), valueEm(p.right) + parens);
    const expr = p.expr ? p.expr.length * 0.55 : valueEm(p.left) + 1.5 + valueEm(p.right) + parens;
    return MARKER_EM + expr + 5.3; // " = " plus the answer blank
  }

  function makeGroup(problems, stacked) {
    const n = problems.length;
    return {
      problems,
      stacked,
      cols: stacked ? (n <= 8 ? 2 : n <= 15 ? 3 : n <= 24 ? 4 : n <= 35 ? 5 : 6) : n <= 12 ? 2 : n <= 36 ? 3 : 4,
      widestEm: Math.max(...problems.map((p) => problemEm(p, stacked))) + COLUMN_GAP_EM,
      // Stacked problems need room to work the answer below; fractions are about two lines tall.
      heightFactor: stacked ? 0.24 : problems.some((p) => isFraction(p.left)) ? 0.3 : 0.42,
    };
  }

  function fontSizeFor(groups, usableH, usableW) {
    const rows = groups.reduce((sum, g) => sum + Math.ceil(g.problems.length / g.cols), 0);
    const rowPt = usableH / rows;
    return Math.min(24, ...groups.map((g) => Math.min(rowPt * g.heightFactor, usableW / g.cols / g.widestEm)));
  }

  /**
   * Splits a page into stacked and inline groups, each with its own column
   * count, and picks one font size that fits both on the page. Columns are
   * dropped while that makes the text bigger, so wide problems get room.
   */
  function layoutPage(problems, vertical, paper, headerPt) {
    const stacked = vertical ? problems.filter((p) => p.stackable) : [];
    const inline = vertical ? problems.filter((p) => !p.stackable) : problems;
    const groups = [];
    if (stacked.length) groups.push(makeGroup(stacked, true));
    if (inline.length) groups.push(makeGroup(inline, false));

    const usableH = (paper.h - 1) * 72 - headerPt - (groups.length - 1) * 12;
    const usableW = (paper.w - 1) * 72;
    let fs = fontSizeFor(groups, usableH, usableW);
    let improved = true;
    while (improved) {
      improved = false;
      for (const g of groups) {
        if (g.cols === 1) continue;
        g.cols--;
        const next = fontSizeFor(groups, usableH, usableW);
        if (next > fs + 0.1) {
          fs = next;
          improved = true;
        } else {
          g.cols++;
        }
      }
    }
    return { groups, fs: Math.max(9, fs) };
  }

  // Stacked problems come first on vertical sheets so each kind lines up in its own grid.
  function orderForLayout(problems, layout) {
    if (layout !== 'vertical') return problems;
    return [...problems.filter((p) => p.stackable), ...problems.filter((p) => !p.stackable)];
  }

  function headerHtml(content) {
    return `
      <header class="mb-4 flex items-end gap-6 border-b-2 border-black pb-3 text-sm" style="height:${HEADER_PT - 14}pt">
        ${content}
      </header>`;
  }

  function sheetHtml(problems, index, state) {
    const paper = PAPER[state.paper];
    const showPage = state.pages > 1;
    const hasHeader = state.showName || state.showScore || showPage;
    const vertical = state.layout === 'vertical';
    const { groups, fs } = layoutPage(problems, vertical, paper, hasHeader ? HEADER_PT : 0);
    const name = state.showName
      ? '<span class="flex flex-1 items-end gap-2">Name<span class="flex-1 border-b border-black"></span></span>'
      : '';
    const score = state.showScore
      ? `<span class="flex items-end gap-2">Score<span class="w-10 border-b border-black"></span>/ ${problems.length}</span>`
      : '';
    const pageLabel = showPage ? `<span>Page ${index + 1} of ${state.pages}</span>` : '';
    const header = hasHeader
      ? headerHtml(`${name}<span class="ml-auto flex items-end gap-6">${score}${pageLabel}</span>`)
      : '';
    let numbered = 0;
    const lists = groups
      .map((g) => {
        const items = g.problems
          .map((p) => `<li aria-label="${escapeHtml(p.text)} equals blank">${problemHtml(p, g.stacked)}</li>`)
          .join('');
        const rows = Math.ceil(g.problems.length / g.cols);
        const style = `grid-template-columns:repeat(${g.cols},minmax(0,1fr));flex-grow:${rows};counter-reset:q ${numbered}`;
        numbered += g.problems.length;
        return `<ol role="list" start="${numbered - g.problems.length + 1}" class="problems" style="${style}">${items}</ol>`;
      })
      .join('');
    return `
      <section class="sheet mx-auto mb-6 shadow-lg" aria-label="Worksheet ${index + 1}">
        ${header}
        <div class="problem-groups" style="--fs:${fs.toFixed(1)}pt">${lists}</div>
      </section>`;
  }

  // Must match .answer-key li height in index.html.
  const KEY_LINE_PT = 21;
  const KEY_COLUMNS = 3;

  /**
   * Answers for every worksheet page share one key page, in sections per
   * worksheet page that read left to right. Extra key pages are added only
   * when the rows run out.
   */
  function answerKeyHtml(sheets, state) {
    const paper = PAPER[state.paper];
    const rowsPerPage = Math.floor(((paper.h - 1) * 72 - HEADER_PT - 10) / KEY_LINE_PT);
    const keyPages = [[]];
    let used = 0;
    const pushRow = (items) => {
      keyPages[keyPages.length - 1].push(...items);
      used++;
    };
    const newPage = () => {
      keyPages.push([]);
      used = 0;
    };

    sheets.forEach((problems, i) => {
      const heading = (continued) =>
        sheets.length > 1 ? `<li class="col-span-full font-bold">Page ${i + 1}${continued ? ' (continued)' : ''}</li>` : null;
      const answers = problems.map(
        (p, n) =>
          `<li><span class="text-gray-600">${n + 1}.</span> ${escapeHtml(p.text)} = <strong>${valueHtml(p.answer)}</strong></li>`
      );
      // Keep a heading together with at least its first row of answers.
      if (heading(false) && used + 2 > rowsPerPage) newPage();
      if (heading(false)) pushRow([heading(false)]);
      for (let r = 0; r < answers.length; r += KEY_COLUMNS) {
        if (used + 1 > rowsPerPage) {
          newPage();
          if (heading(true)) pushRow([heading(true)]);
        }
        pushRow(answers.slice(r, r + KEY_COLUMNS));
      }
    });

    return keyPages
      .map((items, i) => {
        const label = keyPages.length > 1 ? `Answer key (${i + 1} of ${keyPages.length})` : 'Answer key';
        return `
          <section class="sheet mx-auto mb-6 shadow-lg" aria-label="${label}">
            ${headerHtml(`<h2 class="text-lg font-bold">${label}</h2>`)}
            <ul role="list" class="answer-key">${items.join('')}</ul>
          </section>`;
      })
      .join('');
  }

  function setPaper(paperId) {
    const paper = PAPER[paperId];
    pageStyle.textContent = `@page { size: ${paper.css}; margin: 0; } :root { --page-w: ${paper.w}in; --page-h: ${paper.h}in; }`;
  }

  function render(state) {
    const selections = OPERATIONS.filter((op) => state.ops[op.id].on).map((op) => ({ id: op.id, ...state.ops[op.id] }));
    if (!selections.length) {
      errorEl.textContent = 'Select at least one operation.';
      return false;
    }
    errorEl.textContent = '';
    setPaper(state.paper);
    const sheets = generateSheets({
      selections,
      count: state.count,
      pages: state.pages,
      settings: { allowNegatives: state.allowNegatives, remainders: state.remainders },
      seed,
    }).map((problems) => orderForLayout(problems, state.layout));
    let html = sheets.map((problems, i) => sheetHtml(problems, i, state)).join('');
    if (state.answerKey) html += answerKeyHtml(sheets, state);
    preview.innerHTML = html;
    return true;
  }

  // A fixed seed means display-only changes (layout, paper, header fields) keep the same problems.
  let seed = newSeed();

  function newSeed() {
    return Math.floor(Math.random() * 2 ** 32);
  }

  function update() {
    const state = readForm();
    save(state);
    return render(state);
  }

  let pending;
  function scheduleUpdate() {
    clearTimeout(pending);
    pending = setTimeout(update, 200);
  }

  buildControls();
  const saved = load();
  if (saved) {
    applyState(saved);
  } else {
    gradeSelect.value = DEFAULT_GRADE;
    applyPreset(DEFAULT_GRADE);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    seed = newSeed();
    update();
  });

  // Typing is debounced; the preview catches up as soon as the user pauses.
  form.addEventListener('input', scheduleUpdate);

  // Once a field is left, show the clamped value actually being used (e.g. 500 questions -> 60).
  form.addEventListener('change', () => applyState(readForm()));

  gradeSelect.addEventListener('change', () => applyPreset(gradeSelect.value));

  // Hand edits to an operation mean the sheet no longer matches the chosen preset.
  opsContainer.addEventListener('input', () => {
    gradeSelect.value = '';
  });

  document.getElementById('print').addEventListener('click', () => {
    clearTimeout(pending);
    if (update()) window.print();
  });

  update();
})();
