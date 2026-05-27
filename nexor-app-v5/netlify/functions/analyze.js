// NetForge AI — Proxy Claude API
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsH() });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({
    error: 'ANTHROPIC_API_KEY manquante — Netlify → Site settings → Environment variables'
  }), { status: 500, headers: corsH() });

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: corsH() }); }

  let messages, system, model = 'claude-sonnet-4-5', max_tokens = 4096;

  if (body.logs) {
    // Format Log Analyzer : { system, logs }
    system = body.system || '';
    messages = [{ role: 'user', content: body.logs }];
  } else if (body.messages) {
    // Format générique : { messages, model, max_tokens, system }
    messages = body.messages;
    system = body.system;
    model = body.model || model;
    max_tokens = body.max_tokens || max_tokens;
  } else {
    return new Response(JSON.stringify({ error: 'Paramètre logs ou messages manquant' }),
      { status: 400, headers: corsH() });
  }

  try {
    const payload = { model, max_tokens, messages };
    if (system) payload.system = system;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) return new Response(JSON.stringify({ error: data.error?.message || 'Erreur Anthropic', details: data }),
      { status: resp.status, headers: corsH() });
    return new Response(JSON.stringify(data), { status: 200, headers: corsH() });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsH() });
  }
};

function corsH() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
export const config = { path: '/api/analyze' };
