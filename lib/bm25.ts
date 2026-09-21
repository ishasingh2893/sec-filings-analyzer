export type FilingChunk = {
  id: string;
  title: string;
  source: string;
  text: string;
};

export type RetrievalResult = FilingChunk & {
  score: number;
};

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'to',
  'we',
  'with',
]);

function tokenize(text: string) {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [])
    .map((token) => token.replace(/'s$/, ''))
    .map((token) => {
      if (token === 'sales') return 'sale';
      if (token.endsWith('phones')) return token.slice(0, -1);
      if (token === 'services') return 'service';
      if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
      if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
      if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
      if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
      return token;
    })
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function expandQueryTokens(tokens: string[]) {
  const synonyms: Record<string, string[]> = {
    borrow: ['debt', 'liability', 'maturity', 'credit'],
    business: ['company', 'product', 'service', 'market'],
    cash: ['liquidity', 'flow', 'equivalent'],
    debt: ['borrow', 'liability', 'maturity', 'credit'],
    employee: ['headcount', 'workforce', 'people'],
    earn: ['income', 'earning', 'profit'],
    income: ['earning', 'profit', 'net'],
    make: ['business', 'product', 'service', 'revenue', 'income'],
    product: ['service', 'business', 'market'],
    revenue: ['sale', 'net', 'sales'],
    risk: ['factor', 'uncertainty', 'adverse'],
    sale: ['revenue', 'net'],
    service: ['product', 'business', 'market'],
  };
  return [...new Set(tokens.flatMap((token) => [token, ...(synonyms[token] || [])]))];
}

function inferQueryTerms(query: string) {
  const normalized = query.toLowerCase();
  const terms = new Set<string>();

  const add = (...values: string[]) => values.forEach((value) => terms.add(value));

  if (/\b(risks?|risk factors?|competition|competitive|regulation|regulatory|supply|adverse)\b/.test(normalized)) {
    add('risk', 'factor', 'adverse', 'competition');
  }
  if (/\b(products?|services?|sell|sells|business|what (?:does|do)|make|markets?)\b/.test(normalized)) {
    add('product', 'service', 'business', 'market', 'smartphone', 'computer', 'wearable');
  }
  if (/\b(revenue|revenues|sales|net sales|top line)\b/.test(normalized)) {
    add('revenue', 'sale', 'sales');
  }
  if (/\b(net income|income|profit|profits|earnings|earned|how much .*make|money)\b/.test(normalized)) {
    add('income', 'earning', 'profit', 'net');
  }
  if (/\b(cash flow|free cash flow|operating cash|capex|capital expenditures?)\b/.test(normalized)) {
    add('cash', 'flow', 'operating', 'capital', 'expenditure');
  }
  if (/\b(cash|liquidity|liquid|equivalents?)\b/.test(normalized)) {
    add('cash', 'liquidity', 'equivalent');
  }
  if (/\b(debt|borrowings?|liabilities|maturit(?:y|ies)|credit)\b/.test(normalized)) {
    add('debt', 'liability', 'maturity', 'credit');
  }
  if (/\b(assets?|balance sheet)\b/.test(normalized)) {
    add('asset', 'balance');
  }
  if (/\b(employees?|headcount|workforce|people)\b/.test(normalized)) {
    add('employee', 'headcount', 'workforce', 'people');
  }
  if (/\b(shares?|eps|per share|diluted)\b/.test(normalized)) {
    add('share', 'eps', 'diluted');
  }

  return [...terms];
}

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function makeFilingChunks(
  sections: { title: string; source: string; text: string }[],
  maxWords = 180,
  overlapWords = 35,
): FilingChunk[] {
  const chunks: FilingChunk[] = [];
  const step = Math.max(1, maxWords - overlapWords);

  for (const section of sections) {
    const words = normalizeText(section.text).split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    for (let start = 0; start < words.length; start += step) {
      const slice = words.slice(start, start + maxWords);
      if (slice.length < 24 && words.length > maxWords) break;
      const index = chunks.length + 1;
      chunks.push({
        id: `chunk-${index}`,
        title: section.title,
        source: `${section.source} · chunk ${Math.floor(start / step) + 1}`,
        text: slice.join(' '),
      });
      if (start + maxWords >= words.length) break;
    }
  }

  return chunks;
}

export function retrieveBm25(
  query: string,
  chunks: FilingChunk[],
  limit = 5,
): RetrievalResult[] {
  const queryTokens = expandQueryTokens([...new Set(tokenize(query))]);
  if (!queryTokens.length || !chunks.length) return [];

  const documents = chunks.map((chunk) => tokenize(`${chunk.title} ${chunk.text}`));
  const averageLength =
    documents.reduce((sum, tokens) => sum + tokens.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();

  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const k1 = 1.5;
  const b = 0.75;

  return chunks
    .map((chunk, index) => {
      const tokens = documents[index];
      const frequencies = new Map<string, number>();
      for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);

      const score = queryTokens.reduce((sum, token) => {
        const frequency = frequencies.get(token) || 0;
        if (!frequency) return sum;
        const df = documentFrequency.get(token) || 0;
        const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
        const denominator = frequency + k1 * (1 - b + b * (tokens.length / averageLength));
        return sum + idf * ((frequency * (k1 + 1)) / denominator);
      }, 0);

      return { ...chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, bScore) => bScore.score - a.score)
    .slice(0, limit);
}

export function retrieveGroundedChunks(
  query: string,
  chunks: FilingChunk[],
  limit = 5,
): RetrievalResult[] {
  if (!chunks.length) return [];
  const bm25Results = retrieveBm25(query, chunks, chunks.length);
  const bm25Scores = new Map(bm25Results.map((result) => [result.id, result.score]));
  const queryTokens = expandQueryTokens([...new Set(tokenize(query))]);
  const inferredTerms = inferQueryTerms(query);
  const weightedTerms = [...new Set([...queryTokens, ...inferredTerms])];
  if (!weightedTerms.length) return [];

  return chunks
    .map((chunk) => {
      const haystack = tokenize(`${chunk.title} ${chunk.source} ${chunk.text}`);
      const haystackSet = new Set(haystack);
      const overlap = weightedTerms.reduce((sum, term) => sum + (haystackSet.has(term) ? 1 : 0), 0);
      const titleBoost = inferredTerms.some((term) => tokenize(chunk.title).includes(term)) ? 1.5 : 0;
      const score = (bm25Scores.get(chunk.id) || 0) + overlap * 0.85 + titleBoost;
      return { ...chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, bScore) => bScore.score - a.score)
    .slice(0, limit);
}
