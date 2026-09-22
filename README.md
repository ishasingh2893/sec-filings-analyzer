# Filing Notes

A browser-based 10-K research dashboard styled to match Isha's portfolio: Newsreader and DM Sans, cream, forest green, and lime. Includes a link back to the portfolio.

## Project layout

- `app/`, `components/`, `hooks/`, `lib/`: frontend and browser-side filing tools.
- `backend/analyzer/`: Python SEC analyzer Lambda and local analyzer server.
- `backend/chat/`: Node chat Lambda and shared OpenAI grounding logic.
- `scripts/`: Lambda packaging helpers.
- `outputs/`: generated Lambda upload zips.

## Run

Requires Node 22.13 or newer. Run `npm ci`, then `npm run dev`. Production build: `npm run build`.

For local filing analysis, run the analyzer server in a second terminal:

`python3 backend/analyzer/local_analyzer_server.py`

The browser calls the analyzer API at `VITE_ANALYZER_API_URL`, falling back to `NEXT_PUBLIC_ANALYZER_API_URL`. For local development, keep this in ignored `.env.local`:

`VITE_ANALYZER_API_URL=http://localhost:8000/`

For AWS/deployed runs, configure `VITE_ANALYZER_API_URL` in the deployment environment with the Lambda/API URL instead of committing it.

If chat answers are served from the AWS chat Lambda, also configure:

`VITE_CHAT_API_URL=https://your-api-id.execute-api.your-region.amazonaws.com/chat`

For generated chat answers, set an OpenAI API key in your local environment before starting the dev server:

`OPENAI_API_KEY=your_key_here`

Optional:

`OPENAI_MODEL=gpt-5.6-luna`

The key is read only by the server-side `/api/chat` route and should not be exposed with a `VITE_` or `NEXT_PUBLIC_` prefix.

## BM25 Filing Chat

After a 10-K is loaded, the app chunks the returned filing text in the browser and ranks passages with BM25 for each chat query. The top retrieved passages are sent to the server-side chat endpoint, which calls OpenAI when `OPENAI_API_KEY` is configured. Answers are instructed to use only the retrieved filing excerpts and cite them inline.

## Analysis

Drop a PDF annual filing (30 MB maximum). Files remain in browser memory and are not uploaded or persisted. PDF text extraction uses bundled PDF.js. Scanned PDFs require OCR before uploading.

HTML inline XBRL extraction selects consolidated USD annual facts for the document reporting date; dimensional and quarterly contexts are excluded. Supported fields: revenue, net income, operating cash flow, cash, noncurrent debt, and diluted weighted-average shares. Amounts and shares are normalized to millions. Conflicting facts stay blank. Text tables produce explicitly unverified candidates only when consolidated headings, currency, units, and multiple columns are present. Unrecognized facts remain editable. Custom taxonomy tags and unusual layouts can require manual entry.

Summaries are rule-based excerpts from Business, Risk Factors, and Management's Discussion sections, not generative AI or exhaustive analysis. Valuation uses net income times assumed P/E divided by diluted weighted-average shares. Defaults are illustrative, not peer-derived recommendations; there is no live market-price feed. Review earnings attribution, currency, fiscal period, shares, and one-time items before interpreting results. The model does not support loss-making companies.

## Checks

`node --experimental-strip-types --test tests/filing.test.mjs`

`npm exec tsc -- --noEmit`

`npm run build`

## AWS

See `AWS_DEPLOYMENT.md` for Lambda, API Gateway, and frontend environment setup.
