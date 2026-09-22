import { answerFilingQuestion } from '@/lib/chat-core';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const result = await answerFilingQuestion(body);
  return Response.json(result.body, { status: result.status });
}
