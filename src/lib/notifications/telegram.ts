/**
 * Tiny wrapper around Telegram's Bot API. Silent no-op if
 * TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID aren't set, so missing
 * config never crashes a caller — just skips the notification.
 */

export async function sendTelegramMessage(
  text: string,
  opts: { plain?: boolean } = {},
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN/CHAT_ID not set, skipping");
    return false;
  }

  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    if (!opts.plain) payload.parse_mode = "Markdown";

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[telegram] ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "[telegram] send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
