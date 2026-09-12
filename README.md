# Filing Notes

A browser-based 10-K research dashboard styled to match Isha's portfolio: Newsreader and DM Sans, cream, forest green, and lime. Includes a link back to the portfolio.

## Run

Requires Node 22.13 or newer. Run `npm ci`, then `npm run dev`. Production build: `npm run build`.

## Analysis

Drop a PDF annual filing (30 MB maximum). Files remain in browser memory and are not uploaded or persisted. PDF text extraction uses bundled PDF.js. Scanned PDFs require OCR before uploading.

HTML inline XBRL extraction selects consolidated USD annual facts for the document reporting date; dimensional and quarterly contexts are excluded. Supported fields: revenue, net income, operating cash flow, cash, noncurrent debt, and diluted weighted-average shares. Amounts and shares are normalized to millions. Conflicting facts stay blank. Text tables produce explicitly unverified candidates only when consolidated headings, currency, units, and multiple columns are present. Unrecognized facts remain editable. Custom taxonomy tags and unusual layouts can require manual entry.

Summaries are rule-based excerpts from Business, Risk Factors, and Management's Discussion sections, not generative AI or exhaustive analysis. Valuation uses net income times assumed P/E divided by diluted weighted-average shares. Defaults are illustrative, not peer-derived recommendations; there is no live market-price feed. Review earnings attribution, currency, fiscal period, shares, and one-time items before interpreting results. The model does not support loss-making companies.

## Checks

`node --experimental-strip-types --test tests/filing.test.mjs`

`npm exec tsc -- --noEmit`

`npm run build`
