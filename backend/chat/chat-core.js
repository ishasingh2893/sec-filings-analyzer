function outputText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.output_text === 'string') return data.output_text;
  if (!Array.isArray(data.output)) return '';

  return data.output
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || !Array.isArray(item.content)) return [];
      return item.content.flatMap((part) => {
        if (!part || typeof part !== 'object') return [];
        return typeof part.text === 'string' ? [part.text] : [];
      });
    })
    .join('\n')
    .trim();
}

function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function cleanSectionText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function polishedSectionsPrompt(body) {
  const sections = {
    business: cleanSectionText(body?.sections?.business).slice(0, 2400),
    products_services: cleanSectionText(body?.sections?.products_services).slice(0, 2400),
    risk_factors: cleanSectionText(body?.sections?.risk_factors).slice(0, 2400),
  };

  return `Rewrite the extracted SEC filing excerpts into polished, plain-English prose for a research dashboard.

Rules:
- Use only the supplied excerpt text. Do not add outside facts, estimates, or interpretation.
- Preserve the meaning and material caveats.
- Keep business and products_services to one concise paragraph each.
- Keep risk_factors to 4 concise sentences. Do not include bullet markers or numbering.
- Avoid citations, markdown headings, and promotional language.
- Return only valid JSON with string keys: business, products_services, risk_factors.

Company: ${body.company || 'Unknown company'}
Filing period: ${body.period || 'Unknown period'}

Extracted excerpts:
business: ${sections.business || 'Not provided.'}

products_services: ${sections.products_services || 'Not provided.'}

risk_factors: ${sections.risk_factors || 'Not provided.'}`;
}

export function groundedPrompt(body) {
  const chunks = (body.chunks || []).slice(0, 6).map((chunk, index) => ({
    id: index + 1,
    title: chunk.title,
    source: chunk.source,
    text: String(chunk.text || '').slice(0, 1400),
  }));

  return `You are a SEC 10-K research assistant. Answer the user's question in natural language using only the filing text below.

Rules:
- Answer the question directly. Do not preface the answer with phrases like "the retrieved excerpts," "the provided context," "the filing excerpts," or "the source text."
- Use the filing text as raw source material and rewrite it into a clear, natural answer to the user's question.
- If the filing text does not contain enough information, say: "The filing text available here does not answer that."
- Do not use outside knowledge.
- Be concise and specific.
- Cite sources inline as [1], [2], etc. using the excerpt numbers.
- This is research assistance, not investment advice.

Company: ${body.company || 'Unknown company'}
Filing period: ${body.period || 'Unknown period'}

User question:
${body.query}

Retrieved filing excerpts:
${chunks.map((chunk) => `[${chunk.id}] ${chunk.title} — ${chunk.source}\n${chunk.text}`).join('\n\n')}`;
}

export function validatePolishSectionsRequest(body) {
  const sections = body?.sections && typeof body.sections === 'object' ? body.sections : {};
  const hasSection = ['business', 'products_services', 'risk_factors'].some((key) =>
    cleanSectionText(sections[key])
  );
  if (!hasSection) return { error: 'At least one filing section is required.' };
  return { sections };
}

export function validateChatRequest(body) {
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const chunks = Array.isArray(body?.chunks) ? body.chunks : [];
  if (!query) return { error: 'Query is required.' };
  if (!chunks.length) return { error: 'At least one retrieved filing chunk is required.' };
  return { query, chunks };
}

export async function polishFilingSections(body, env = process.env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 503, body: { error: 'OPENAI_API_KEY is not configured on the server.' } };
  }

  const validation = validatePolishSectionsRequest(body);
  if (validation.error) return { status: 400, body: { error: validation.error } };

  const model = env.OPENAI_MODEL || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: polishedSectionsPrompt(body),
      max_output_tokens: 650,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof data.error?.message === 'string'
        ? data.error.message
        : `OpenAI request failed with status ${response.status}.`;
    return { status: response.status, body: { error: message } };
  }

  const parsed = parseJsonObject(outputText(data));
  if (!parsed) return { status: 502, body: { error: 'The model returned invalid JSON.' } };

  return {
    status: 200,
    body: {
      sections: {
        business: cleanSectionText(parsed.business) || cleanSectionText(validation.sections.business),
        products_services:
          cleanSectionText(parsed.products_services) ||
          cleanSectionText(validation.sections.products_services),
        risk_factors:
          cleanSectionText(parsed.risk_factors) || cleanSectionText(validation.sections.risk_factors),
      },
      model,
    },
  };
}

export async function answerFilingQuestion(body, env = process.env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 503, body: { error: 'OPENAI_API_KEY is not configured on the server.' } };
  }

  const validation = validateChatRequest(body);
  if (validation.error) return { status: 400, body: { error: validation.error } };

  const model = env.OPENAI_MODEL || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: groundedPrompt({ ...body, query: validation.query, chunks: validation.chunks }),
      max_output_tokens: 550,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof data.error?.message === 'string'
        ? data.error.message
        : `OpenAI request failed with status ${response.status}.`;
    return { status: response.status, body: { error: message } };
  }

  return {
    status: 200,
    body: {
      answer: outputText(data) || 'The model returned an empty response.',
      model,
    },
  };
}
