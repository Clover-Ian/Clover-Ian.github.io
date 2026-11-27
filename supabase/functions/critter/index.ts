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
  "Access-Control-Expose-Headers": "x-iys-key, x-iys-model, x-iys-host",
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
    const authHeader = request.headers.get("Authorization") ?? "";
    const keys: Array<{ id: string; label: string; models: string[] }> = [];

    if (authHeader.startsWith("Bearer ")) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );

        // 新版：id/label/created_at；旧表结构下回退
        let rows: any[] | null = null;
        const first = await supabase
          .from("user_ai_settings")
          .select("id, label, api_key, base_url")
          .order("created_at", { ascending: false });

        if (!first.error) {
          rows = first.data as any[];
        } else {
          const fallback = await supabase
            .from("user_ai_settings")
            .select("api_key, base_url, model")
            .limit(5);
          rows = (fallback.data ?? []).map((row: any, index: number) => ({
            id: `legacy-${index}`,
            label: row.model || "My key",
            api_key: row.api_key,
            base_url: row.base_url,
          }));
        }

        const data = rows;

        for (const row of data ?? []) {
          if (!row?.api_key) continue;
          let models: string[] = [];
          try {
            const listing = await fetch(`${row.base_url || RELAY_BASE}/models`, {
              headers: { Authorization: `Bearer ${row.api_key}` },
            });
            if (listing.ok) {
              const body = await listing.json();
              models = (body?.data ?? [])
                .map((item: { id?: string }) => item?.id)
                .filter((id: unknown): id is string => typeof id === "string");
            }
          } catch { /* 该家没有 /models 就留空 */ }

          keys.push({ id: row.id, label: row.label || "My key", models });
        }
      } catch { /* 忽略 */ }
    }

    return json({ models: MODELS, default: DEFAULT_MODEL, keys });
  }

  const auth = request.headers.get("Authorization") ?? "";

  // 读用户自己的 key（RLS 保证只能读到自己那一行）
  let userKey: string | null = null;
  let userBase: string | null = null;

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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.api_key) {
        userKey = data.api_key;
        userBase = data.base_url ?? null;
      }
    } catch { /* 忽略：退回共享 key */ }
  }

  try {
    const { messages, maxTokens, system, model, keyId } = await request.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages is required" }, 400);
    }

    const requested = String(model ?? DEFAULT_MODEL);
    const inSharedList = MODELS.includes(requested);

    // 指定的那条 key（前端从下拉里的 value 带过来）
    let pickedKey: string | null = null;
    let pickedBase: string | null = null;

    if (keyId && auth.startsWith("Bearer ")) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: auth } } },
        );
        const { data } = await supabase
          .from("user_ai_settings")
          .select("api_key, base_url")
          .eq("id", keyId)
          .maybeSingle();

        if (data?.api_key) {
          pickedKey = data.api_key;
          pickedBase = data.base_url ?? null;
        }
      } catch { /* 忽略 */ }
    }

    // 指定了 key 就用它；否则看模型是否在白名单
    const useOwn = Boolean(pickedKey) || (!inSharedList && Boolean(userKey));
    const key = pickedKey ?? (useOwn ? userKey : RELAY_KEY);
    const base = pickedBase ?? (useOwn && userBase ? userBase : RELAY_BASE);
    const chosen = inSharedList ? requested : requested;

    if (!key) return json({ error: "No API key configured" }, 500);

    const payload = JSON.stringify({
      model: chosen,
      messages: system
        ? [{ role: "system", content: String(system).slice(0, 1200) }, ...messages]
        : messages,
      max_tokens: Math.min(Number(maxTokens) || 300, 10000),
      temperature: 0.85,
    });

    // 上游偶尔连不上（尤其国内中转对海外机房），重试一次再说
    let upstream: Response | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: payload,
          signal: AbortSignal.timeout(15000),
        });
        if (upstream.ok || upstream.status < 500) break;
      } catch (error) {
        lastError = String(error);
        upstream = null;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }

    // 有些模型不接受 10000，自动降到 4000 再试
    if (upstream && !upstream.ok && upstream.status === 400) {
      const bodyText = await upstream.clone().text();
      if (/max_tokens|max output|too large|invalid.*token/i.test(bodyText)) {
        const fallbackPayload = JSON.stringify({
          model: chosen,
          messages: system
            ? [{ role: "system", content: String(system).slice(0, 1200) }, ...messages]
            : messages,
          max_tokens: 4000,
          temperature: 0.85,
        });
        try {
          upstream = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: fallbackPayload,
            signal: AbortSignal.timeout(20000),
          });
        } catch { /* 保持原来的错误 */ }
      }
    }

    if (!upstream) {
      return json({
        error: `Could not reach ${(() => { try { return new URL(base).hostname; } catch { return "the model provider"; } })()} — ${lastError || "connection timed out"}`,
      }, 502);
    }

    const text = await upstream.text();

    // 供调试：在响应头里标明这次用的是谁的钱、哪个模型、哪家 base
    let host = "unknown";
    try { host = new URL(base).hostname; } catch { /* 忽略 */ }

    return new Response(text, {
      status: upstream.status,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "x-iys-key": useOwn ? "own" : "shared",
        "x-iys-model": chosen,
        "x-iys-host": host,
      },
    });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
