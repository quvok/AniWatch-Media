const json = (data, status = 200, origin = "") => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
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
  const video = typeof payload.video === "string" ? payload.video.trim() : "";
  const photoData = typeof payload.photoData === "string" ? payload.photoData : "";
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  if (!text) throw new Error("Post text is required");
  if (text.length > 4096) throw new Error("Telegram text limit is 4096 characters");
  if ([photo, photoData, video].filter(Boolean).length > 1) throw new Error("Use only one media source");
  if (photoData && (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(photoData) || photoData.length > 1400000)) throw new Error("Inline image must be a JPEG or PNG smaller than 1 MB");
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
  for (const media of [photo, video].filter(Boolean)) {
    try {
      const parsed = new URL(media);
      if (parsed.protocol !== "https:") throw new Error("Invalid protocol");
    } catch {
      throw new Error("Media URL must be a valid HTTPS URL");
    }
  }
  if ((photo || video) && text.length > 1024) throw new Error("Media caption must not exceed 1024 characters");
  return { text, photo, photoData, video, buttons };
}

async function telegramRequest(env, method, payload) {
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram API request failed");
  return result.result;
}

async function sendTelegram(env, post) {
  const { text, photo, photoData, video, buttons = [] } = post;
  const method = (photo || photoData) ? "sendPhoto" : video ? "sendVideo" : "sendMessage";
  const replyMarkup = buttons.length
    ? { inline_keyboard: buttons.map(button => [{ text: button.text, url: button.url }]) }
    : undefined;
  const body = photoData
    ? (() => {
        const encoded = photoData.split(",", 2)[1];
        const mime = photoData.startsWith("data:image/png") ? "image/png" : "image/jpeg";
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const form = new FormData();
        form.set("chat_id", env.TELEGRAM_CHANNEL_ID);
        form.set("photo", new Blob([bytes], { type: mime }), mime === "image/png" ? "image.png" : "image.jpg");
        form.set("caption", text);
        form.set("parse_mode", "HTML");
        if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
        return form;
      })()
    : photo
      ? { chat_id: env.TELEGRAM_CHANNEL_ID, photo, caption: text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
      : video
        ? { chat_id: env.TELEGRAM_CHANNEL_ID, video, caption: text, parse_mode: "HTML", supports_streaming: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
        : { chat_id: env.TELEGRAM_CHANNEL_ID, text, parse_mode: "HTML", disable_web_page_preview: false, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };

  const result = await telegramRequest(env, method, body);
  return {
    message_id: result.message_id,
    chat_id: result.chat?.id,
    date: result.date,
    media_type: (photo || photoData) ? "photo" : video ? "video" : "text"
  };
}

async function getAnalytics(env) {
  const result = await telegramRequest(env, "getChatMemberCount", { chat_id: env.TELEGRAM_CHANNEL_ID });
  return { ok: true, member_count: result, source: "Telegram Bot API", measured_at: new Date().toISOString() };
}

function extractAiText(result) {
  if (typeof result === "string") return result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.output_text === "string") return result.output_text;
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content;
  if (Array.isArray(result?.content)) return result.content.map(item => item.text || "").join("\n").trim();
  return "";
}

async function generateAi(env, payload) {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new Error("Workers AI не подключён. В Cloudflare Worker добавь AI binding с именем AI и повторно нажми Deploy.");
  }
  const task = typeof payload.task === "string" ? payload.task : "write";
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const context = typeof payload.context === "string" ? payload.context.trim().slice(0, 2500) : "";
  if (!prompt) throw new Error("Опиши задачу для ИИ-ассистента.");
  if (prompt.length > 5000) throw new Error("Запрос слишком длинный (максимум 5000 символов).");
  const taskInstructions = {
    write: "Создай готовую публикацию для Telegram-канала AniWatch. Не выдумывай факты, даты релизов, названия и ссылки. Если данных не хватает, используй нейтральную формулировку.",
    ideas: "Предложи 8 конкретных идей публикаций для аниме Telegram-канала. Для каждой укажи формат, короткий хук и зачем это аудитории. Не повторяйся.",
    rewrite: "Отредактируй исходный текст: улучши ясность, ритм и привлекательность, сохрани смысл и проверяемые факты. Верни только итоговый вариант.",
    plan: "Составь реалистичный контент-план на 7 дней для Telegram-канала AniWatch. Смешай форматы: новости (только если предоставлены факты), рекомендации, интерактив, подборки и промо. Не выдумывай премьеры и даты."
  };
  const system = "Ты — редактор и контент-стратег AniWatch, русскоязычного аниме-стриминга. Пиши по-русски, естественно, без канцелярита и кликбейта. Не обещай то, чего нет в исходных данных. Не добавляй фальшивые ссылки, цифры или сведения о релизах. Тон: уверенный, современный, умеренно живой. " + (taskInstructions[task] || taskInstructions.write);
  const model = typeof env.AI_MODEL === "string" && env.AI_MODEL.startsWith("@cf/") ? env.AI_MODEL : "@cf/zai-org/glm-4.7-flash";
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: (context ? "Контекст / исходный материал:\n" + context + "\n\n" : "") + prompt }
    ],
    max_tokens: 1200,
    temperature: 0.7
  });
  const answer = extractAiText(result);
  if (!answer) throw new Error("ИИ-модель вернула пустой ответ. Попробуй ещё раз.");
  return { ok: true, text: answer, model };
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
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    const url = new URL(request.url);
    const responseOrigin = allowedOrigin || origin;
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "AniWatch Media Telegram bridge", features: ["publish", "video", "analytics-members", "ai-assistant"] }, 200, responseOrigin);
    }
    if (!["POST", "GET"].includes(request.method)) {
      return json({ error: "Method not allowed" }, 405, responseOrigin);
    }
    const allowedRoutes = ["/publish", "/analytics", "/ai"];
    if (!allowedRoutes.includes(url.pathname)) return json({ error: "Not found" }, 404, responseOrigin);
    if (!env.TELEGRAM_BOT_TOKEN || !env.ADMIN_KEY || !env.TELEGRAM_CHANNEL_ID) {
      return json({ error: "Worker secrets/configuration are incomplete" }, 503, responseOrigin);
    }
    if (!(await authorized(request, env))) return json({ error: "Unauthorized" }, 401, responseOrigin);

    if (url.pathname === "/analytics" && request.method === "GET") {
      try {
        return json(await getAnalytics(env), 200, responseOrigin);
      } catch (error) {
        return json({ error: error.message || "Could not load channel analytics" }, 502, responseOrigin);
      }
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, responseOrigin);
    let payload;
    try {
      const raw = await request.text();
      if (raw.length > 1500000) return json({ error: "Request is too large (maximum 1.5 MB)" }, 413, responseOrigin);
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400, responseOrigin);
    }

    if (url.pathname === "/ai") {
      try {
        return json(await generateAi(env, payload), 200, responseOrigin);
      } catch (error) {
        return json({ error: error.message || "AI request failed" }, 502, responseOrigin);
      }
    }

    let post;
    try { post = validatePost(payload); }
    catch (error) { return json({ error: error.message }, 400, responseOrigin); }
    try {
      const result = await sendTelegram(env, post);
      return json({ ok: true, ...result }, 200, responseOrigin);
    } catch (error) {
      return json({ error: error.message || "Could not reach Telegram API" }, 502, responseOrigin);
    }
  },
};
