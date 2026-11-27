// IYS AI 代理
// - 没带自己的 key：用项目共享 key（有模型白名单）
// - 设置里存了自己的 key：优先用它（模型由用户自己决定）
//
// 部署：Dashboard → Edge Functions → IYS → 粘贴 → Deploy（Verify JWT 保持开启）

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RELAY_BASE = Deno.env.get("RELAY_BASE") ?? "https://relaydock.omnis.com.cn/v1";
const RELAY_KEY = Deno.env.get("RELAY_KEY") ?? "";
const DEFAULT_MODEL = Deno.env.get("RELAY_MODEL") ?? "deepseek-v4.1-flash";

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
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method === "GET") {
    // 带登录令牌时，顺手把「用户自己那家」的模型列表也带上
    const authHeader = request.headers.get("Authorization") ?? "";
    let mine: string[] = [];
    let label: string | null = null;

    if (authHeader.startsWith("Bearer ")) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data } = await supabase
          .from("user_ai_settings")
          .select("api_key, base_url, label")
          .maybeSingle();

        if (data?.api_key) {
          label = data.label ?? null;
          const base = data.base_url || RELAY_BASE;
          const listing = await fetch(`${base}/models`, {
            headers: { Authorization: `Bearer ${data.api_key}` },
          });
          if (listing.ok) {
            const body = await listing.json();
            mine = (body?.data ?? [])
              .map((item: { id?: string }) => item?.id)
              .filter((id: unknown): id is string => typeof id === "string");
          }
        }
      } catch { /* 忽略，返回空的 mine */ }
    }

    return json({ models: MODELS, default: DEFAULT_MODEL, mine, label });
  }

  const auth = request.headers.get("Authorization") ?? "";

  // 读用户自己的 key（RLS 保证只能读到自己那一行）
  let key = RELAY_KEY;
  let base = RELAY_BASE;
  let userModel: string | null = null;

  if (auth.startsWith("Bearer ")) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );

      const { data } = await supabase
        .from("user_ai_settings")
        .select("api_key, base_url, model")
        .maybeSingle();

      if (data?.api_key) {
        key = data.api_key;
        if (data.base_url) base = data.base_url;
        if (data.model) userModel = data.model;
      }
    } catch { /* 忽略：退回共享 key */ }
  }

  if (!key) return json({ error: "No API key configured" }, 500);

  try {
    const { messages, maxTokens, system, model } = await request.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages is required" }, 400);
    }

    const requested = model ?? userModel ?? DEFAULT_MODEL;
    const usingSharedKey = key === RELAY_KEY;
    const chosen = usingSharedKey && !MODELS.includes(requested) ? DEFAULT_MODEL : requested;

    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
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
    return json({ error: String(error) }, 500);
  }
});
