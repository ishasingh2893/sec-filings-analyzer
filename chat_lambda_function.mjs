import { answerFilingQuestion } from './chat-core.js';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  };
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method || event?.httpMethod || 'POST';
  if (method === 'OPTIONS') return jsonResponse(204, {});
  if (method !== 'POST') return jsonResponse(405, { error: 'Only POST is supported.' });

  let body;
  try {
    body = JSON.parse(event?.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON request body.' });
  }

  try {
    const result = await answerFilingQuestion(body);
    return jsonResponse(result.status, result.body);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unable to answer filing question.',
    });
  }
}
