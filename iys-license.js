/*!
 * IYS 授权码 · 网站端助手
 * 依赖 supabase.js（window.iysSupabase）与 supabase-config.js
 *
 * 用法：
 *   const result = await IYSKey.check("IYS-XXXXX-…", "website");
 *   if (result.status === "ok") { unlock(result.expires_at); }
 *
 * 返回的 status：
 *   ok / expired / revoked / unknown / wrong_app / taken / sign_in_required / network
 */
(function () {
  "use strict";

  function client() {
    if (!window.iysSupabase) {
      throw new Error("IYS: supabase client not loaded");
    }
    return window.iysSupabase;
  }

  async function token() {
    const supabase = client();
    const { data } = await supabase.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  async function call(fn, body) {
    const supabase = client();
    const accessToken = await token();
    if (!accessToken) {
      return { status: "sign_in_required" };
    }

    const url = `${supabase.supabaseUrl}/rest/v1/rpc/${fn}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: supabase.supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        return { status: "network", http: response.status };
      }
      return await response.json();
    } catch (error) {
      return { status: "network", message: String(error) };
    }
  }

  window.IYSKey = {
    /** 校验一把 key 能不能解锁某个产品；第一次调用会把它绑到当前账号 */
    async check(key, product) {
      const clean = String(key || "").trim();
      if (!clean) return { status: "unknown" };
      const rows = await call("verify_key", { candidate: clean, app: product || "website" });
      if (Array.isArray(rows)) return rows[0] || { status: "unknown" };
      return rows || { status: "unknown" };
    },

    /** 记住用户输入的 key，省得每次重新输 */
    remember(key, product) {
      try {
        localStorage.setItem(`iys.key.${product || "website"}`, key);
      } catch (error) {}
    },

    stored(product) {
      try {
        return localStorage.getItem(`iys.key.${product || "website"}`);
      } catch (error) {
        return null;
      }
    },

    forget(product) {
      try {
        localStorage.removeItem(`iys.key.${product || "website"}`);
      } catch (error) {}
    }
  };
})();
