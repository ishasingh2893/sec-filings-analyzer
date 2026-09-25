import { answerFilingQuestion, polishFilingSections } from '@/backend/chat/chat-core';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const action = body && typeof body === 'object' && 'action' in body ? body.action : undefined;
  const result =
    action === 'polish-sections' ? await polishFilingSections(body) : await answerFilingQuestion(body);
  return Response.json(result.body, { status: result.status });
}
