// Cloudflare Worker — AI Proxy for Akhilesh's Terminal
// Deploy this to Cloudflare Workers (free tier)
//
// SETUP (Option A — Cloudflare Workers AI, completely free, no key needed):
// 1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
// 2. Paste this code and deploy
// 3. Enable Workers AI: Settings → AI Binding → Add binding (variable name: AI)
// 4. Set your worker URL in index.html → AI_PROXY_URL
//
// SETUP (Option B — Gemini, needs free API key):
// 1. Same as above, but also add:
//    Settings → Variables → GEMINI_KEY = your key (encrypt it)
// 2. The worker auto-detects which backend to use

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://enigma-commits.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const { system, messages } = await request.json();

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid messages' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Limit history to prevent abuse
      const chatMessages = messages.slice(-20);

      let reply;

      // Option A: Cloudflare Workers AI (free, no key needed)
      if (env.AI) {
        const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: system },
            ...chatMessages,
          ],
          max_tokens: 300,
          temperature: 0.7,
        });
        reply = result.response || 'Sorry, I could not generate a response.';
      }
      // Option B: Gemini (free tier key)
      else if (env.GEMINI_KEY) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_KEY}`;
        // Convert chat history to Gemini format
        const contents = chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 300, topP: 0.9 },
          }),
        });

        if (!geminiRes.ok) throw new Error('Gemini API error');
        const data = await geminiRes.json();
        reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
      } else {
        return new Response(JSON.stringify({ error: 'No AI backend configured. Add AI binding or GEMINI_KEY.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
