const json = (data, status = 200, origin = "") => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }
});

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validatePost(payload) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const photo = typeof payload.photo === "string" ? payload.photo.trim() : "";
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  if (!text) throw new Error("Post text is required");
  if (text.length > 4096) throw new Error("Telegram text limit is 4096 characters");
  if (buttons.length > 6) throw new Error("No more than 6 inline buttons are allowed");
  for (const button of buttons) {
    if (!button || typeof button.text !== "string" || !button.text.trim() || button.text.length > 64 || typeof button.url !== "string") {
      throw new Error("Each inline button needs text (1-64 characters) and a URL");
    }
    try {
      const parsed = new URL(button.url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid protocol");
    } catch {
      throw new Error("Inline button URLs must be valid HTTP or HTTPS links");
    }
  }
  if (photo) {
    try {
      const parsed = new URL(photo);
      if (parsed.protocol !== "https:") throw new Error("Invalid protocol");
    } catch {
      throw new Error("Image URL must be a valid HTTPS URL");
    }
    if (text.length > 1024) throw new Error("Caption with an image must not exceed 1024 characters");
  }
  return { text, photo, buttons };
}

async function sendTelegram(env, post) {
  const { text, photo, buttons = [] } = post;
  const method = photo ? "sendPhoto" : "sendMessage";
  const replyMarkup = buttons.length
    ? { inline_keyboard: buttons.map(button => [{ text: button.text, url: button.url }]) }
    : undefined;
  const body = photo
    ? { chat_id: env.TELEGRAM_CHANNEL_ID, photo, caption: text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
    : { chat_id: env.TELEGRAM_CHANNEL_ID, text, parse_mode: "HTML", disable_web_page_preview: false, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };

  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram API request failed");
  return { message_id: result.result.message_id, chat_id: result.result.chat?.id };
}

async function authorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return constantTimeEqual(suppliedKey, env.ADMIN_KEY);
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    const origin = request.headers.get("Origin") || "";
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return json({ error: "Origin not allowed" }, 403, allowedOrigin);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin || origin,
          "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "AniWatch Media Telegram bridge", }, 200, allowedOrigin || origin);
    }
    if (!["POST", "GET"].includes(request.method)) {
      return json({ error: "Method not allowed" }, 405, allowedOrigin || origin);
    }
    if (url.pathname !== "/publish") {
      return json({ error: "Not found" }, 404, allowedOrigin || origin);
    }
    if (!env.TELEGRAM_BOT_TOKEN || !env.ADMIN_KEY || !env.TELEGRAM_CHANNEL_ID) {
      return json({ error: "Worker secrets/configuration are incomplete" }, 503, allowedOrigin || origin);
    }
    if (!(await authorized(request, env))) return json({ error: "Unauthorized" }, 401, allowedOrigin || origin);

    if (url.pathname === "/publish" && request.method === "POST") {
      let payload;
      try {
        const raw = await request.text();
        if (raw.length > 12000) return json({ error: "Request is too large" }, 413, allowedOrigin || origin);
        payload = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid JSON" }, 400, allowedOrigin || origin);
      }
      let post;
      try { post = validatePost(payload); }
      catch (error) { return json({ error: error.message }, 400, allowedOrigin || origin); }
      try {
        const result = await sendTelegram(env, post);
        return json({ ok: true, ...result }, 200, allowedOrigin || origin);
      } catch (error) {
        return json({ error: error.message || "Could not reach Telegram API" }, 502, allowedOrigin || origin);
      }
    }

    return json({ error: "Not found" }, 404, allowedOrigin || origin);
  },
};
