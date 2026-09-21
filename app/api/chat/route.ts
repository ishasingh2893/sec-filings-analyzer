import type { FilingChunk } from '@/lib/bm25';

type ChatRequest = {
  query?: string;
  company?: string;
  period?: string;
  chunks?: FilingChunk[];
};

function outputText(data: unknown) {
  if (typeof data !== 'object' || data === null) return '';
  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === 'string') return direct;

  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (typeof part !== 'object' || part === null) return [];
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? [text] : [];
      });
    })
    .join('\n')
    .trim();
}

function groundedPrompt(body: Required<Pick<ChatRequest, 'query'>> & ChatRequest) {
  const chunks = (body.chunks || []).slice(0, 6).map((chunk, index) => ({
    id: index + 1,
    title: chunk.title,
    source: chunk.source,
    text: chunk.text.slice(0, 1400),
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

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 503 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const query = body.query?.trim();
  const chunks = body.chunks || [];
  if (!query) return Response.json({ error: 'Query is required.' }, { status: 400 });
  if (!chunks.length) {
    return Response.json({ error: 'At least one retrieved filing chunk is required.' }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: groundedPrompt({ ...body, query }),
      max_output_tokens: 550,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { error?: { message?: unknown } }).error?.message === 'string'
        ? (data as { error: { message: string } }).error.message
        : `OpenAI request failed with status ${response.status}.`;
    return Response.json({ error: message }, { status: response.status });
  }

  const answer = outputText(data);
  return Response.json({
    answer: answer || 'The model returned an empty response.',
    model,
  });
}
