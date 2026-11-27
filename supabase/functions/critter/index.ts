// 代理：浏览器 → 这个函数 → 中转平台（key 只存在服务端环境变量里）
// 部署：supabase secrets set RELAY_KEY=sk-... ; supabase functions deploy critter

const RELAY_BASE = Deno.env.get("RELAY_BASE") ?? "https://relaydock.omnis.com.cn/v1";
const RELAY_KEY = Deno.env.get("RELAY_KEY") ?? "";
const DEFAULT_MODEL = Deno.env.get("RELAY_MODEL") ?? "deepseek-v4.1-flash";

// 允许访客选择的模型（白名单，防止有人传任意模型名）
const MODELS = [
  "deepseek-v4.1-flash",
  "glm-5.3-flash",
  "qwen-3.8-flash",
  "relay-rlx/glm-5.3-flash",
  "glm-5.3",
  "GLM-5.4",
  "deepseek-v4-pro",
  "kimi-k3.1-pro",
  "kimi-k3.1-pro-high",
  "mimo-v2.6-pro",
  "grok-composer-2.5-fast",
  "grok-4.7",
  "qwen4_max",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // 列出可选模型
  if (request.method === "GET") {
    return new Response(JSON.stringify({ models: MODELS, default: DEFAULT_MODEL }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!RELAY_KEY) {
    return new Response(JSON.stringify({ error: "RELAY_KEY is not set" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, maxTokens, system, model } = await request.json();
    const chosen = MODELS.includes(model) ? model : DEFAULT_MODEL;

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
        model: chosen,
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
