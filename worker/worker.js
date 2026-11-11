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
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "AniWatch Media Telegram bridge" }, 200, allowedOrigin || origin);
    }

    if (request.method !== "POST" || url.pathname !== "/publish") {
      return json({ error: "Not found" }, 404, allowedOrigin || origin);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.ADMIN_KEY || !env.TELEGRAM_CHANNEL_ID) {
      return json({ error: "Worker secrets/configuration are incomplete" }, 503, allowedOrigin || origin);
    }

    const auth = request.headers.get("Authorization") || "";
    const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!constantTimeEqual(suppliedKey, env.ADMIN_KEY)) {
      return json({ error: "Unauthorized" }, 401, allowedOrigin || origin);
    }

    let payload;
    try {
      const raw = await request.text();
      if (raw.length > 12000) {
        return json({ error: "Request is too large" }, 413, allowedOrigin || origin);
      }
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400, allowedOrigin || origin);
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const photo = typeof payload.photo === "string" ? payload.photo.trim() : "";
    const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];

    if (!text) {
      return json({ error: "Post text is required" }, 400, allowedOrigin || origin);
    }

    if (text.length > 4096) {
      return json({ error: "Telegram text limit is 4096 characters" }, 400, allowedOrigin || origin);
    }

    if (buttons.length > 6) {
      return json({ error: "No more than 6 inline buttons are allowed" }, 400, allowedOrigin || origin);
    }

    for (const button of buttons) {
      if (!button || typeof button.text !== "string" || !button.text.trim() || button.text.length > 64 || typeof button.url !== "string") {
        return json({ error: "Each inline button needs text (1-64 characters) and a URL" }, 400, allowedOrigin || origin);
      }
      try {
        const buttonUrl = new URL(button.url);
        if (buttonUrl.protocol !== "https:" && buttonUrl.protocol !== "http:") throw new Error("Invalid protocol");
      } catch {
        return json({ error: "Inline button URLs must be valid HTTP or HTTPS links" }, 400, allowedOrigin || origin);
      }
    }

    if (photo) {
      let parsed;
      try {
        parsed = new URL(photo);
      } catch {
        return json({ error: "Invalid image URL" }, 400, allowedOrigin || origin);
      }

      if (parsed.protocol !== "https:") {
        return json({ error: "Image URL must use HTTPS" }, 400, allowedOrigin || origin);
      }

      if (text.length > 1024) {
        return json({ error: "Caption with an image must not exceed 1024 characters" }, 400, allowedOrigin || origin);
      }
    }

    const method = photo ? "sendPhoto" : "sendMessage";
    const replyMarkup = buttons.length ? { inline_keyboard: buttons.map(button => [{ text: button.text.trim(), url: button.url.trim() }]) } : undefined;
    const body = photo
      ? { chat_id: env.TELEGRAM_CHANNEL_ID, photo: photo, caption: text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
      : { chat_id: env.TELEGRAM_CHANNEL_ID, text: text, parse_mode: "HTML", disable_web_page_preview: false, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };

    try {
      const tg = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await tg.json();

      if (!tg.ok || !result.ok) {
        return json({ error: result.description || "Telegram API request failed" }, 502, allowedOrigin || origin);
      }

      return json({
        ok: true,
        message_id: result.result.message_id,
        chat_id: result.result.chat?.id
      }, 200, allowedOrigin || origin);
    } catch {
      return json({ error: "Could not reach Telegram API" }, 502, allowedOrigin || origin);
    }
  }
};

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}
