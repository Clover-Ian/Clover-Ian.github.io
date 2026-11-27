// 代理：浏览器 → 这个函数 → 中转平台（key 只存在服务端环境变量里）
// 部署：supabase secrets set RELAY_KEY=sk-... ; supabase functions deploy critter

const RELAY_BASE = Deno.env.get("RELAY_BASE") ?? "https://relaydock.omnis.com.cn/v1";
const RELAY_KEY = Deno.env.get("RELAY_KEY") ?? "";
const MODEL = Deno.env.get("RELAY_MODEL") ?? "deepseek-v4.1-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (!RELAY_KEY) {
    return new Response(JSON.stringify({ error: "RELAY_KEY is not set" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, maxTokens, system } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch(`${RELAY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RELAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: system
          ? [{ role: "system", content: String(system).slice(0, 1200) }, ...messages]
          : messages,
        max_tokens: Math.min(Number(maxTokens) || 220, 600),
        temperature: 0.85,
      }),
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
