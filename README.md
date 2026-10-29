# Math Sheets

Printable math worksheet generator for grades 1–8. Pick operations and number ranges, preview the sheet, and print.

**Live site:** https://paulsheldrake.github.io/math-sheets/

## Features

- **Grade presets** aligned to the [BC Mathematics curriculum](https://curriculum.gov.bc.ca/curriculum/mathematics) (Grade 3 by default). Every preset value can be adjusted afterwards.
- **Operations**, each with its own number range:
  - Addition, subtraction, multiplication (optionally limited to chosen times tables, e.g. 2, 3, 5 and 9), division (optionally with remainders)
  - Fractions (+ −) and fractions (× ÷)
  - Decimals (+ −)
  - Negative numbers
  - Order of operations
- **Questions per page** (1–60) and **pages** (1–20, default 1). Each page gets different problems.
- **Horizontal** (`3 + 4 = ___`) or **vertical** (stacked, with long division) layout.
- Letter or A4 paper, optional name and score fields, and an optional answer key.
- The preview updates as you change options. **New problems** reshuffles the questions without changing the settings.
- Settings are remembered in the browser, and the page URL updates as you change options. Share the link to share the exact sheet; **New problems** changes the link too.

## Running locally

There's no build step. Open `index.html` in a browser. Tailwind CSS loads from a CDN, so an internet connection is needed for styling.

## Tests

The problem generator has unit tests that use Node's built-in test runner (Node 18+):

```sh
npm test
```

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Page markup, Tailwind, and print/worksheet CSS |
| `app.js` | Form handling, sheet layout, and rendering |
| `generator.js` | Problem generation and grade presets (no DOM; shared with tests) |
| `share.js` | Encodes settings in the URL for shareable links (no DOM; shared with tests) |
| `tests/` | Unit tests for the generator and share links |

## Deployment

GitHub Pages serves the `main` branch root. Pushing to `main` redeploys the site.
