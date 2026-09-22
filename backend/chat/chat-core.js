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

export function groundedPrompt(body) {
  const chunks = (body.chunks || []).slice(0, 6).map((chunk, index) => ({
    id: index + 1,
    title: chunk.title,
    source: chunk.source,
    text: String(chunk.text || '').slice(0, 1400),
  }));

  return `You are a SEC 10-K research assistant. Answer the user's question using only the filing excerpts below.

Rules:
- If the excerpts do not contain enough information, say that the retrieved filing context is insufficient.
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

export function validateChatRequest(body) {
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const chunks = Array.isArray(body?.chunks) ? body.chunks : [];
  if (!query) return { error: 'Query is required.' };
  if (!chunks.length) return { error: 'At least one retrieved filing chunk is required.' };
  return { query, chunks };
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
