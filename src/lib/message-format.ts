/**
 * Разметка сообщений. В поле ввода лежит текст с тегами Telegram-HTML
 * (<b>, <i>, <u>, <s>, <a href="...">), всё остальное считается обычным текстом.
 */

const ALLOWED_TAGS = ["b", "i", "u", "s", "code"] as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Готовит текст для Telegram: экранирует всё, а затем возвращает
 * только разрешённые теги. Так случайная угловая скобка не сломает отправку.
 */
export function toTelegramHtml(raw: string): string {
  let html = escapeHtml(raw);

  for (const tag of ALLOWED_TAGS) {
    html = html
      .replaceAll(`&lt;${tag}&gt;`, `<${tag}>`)
      .replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`);
  }

  // Ссылки: <a href="https://...">текст</a>. Схему проверяем — javascript: не пропускаем.
  const linkOpen = (url: string) =>
    /^(https?:\/\/|tg:\/\/|mailto:)/i.test(url) ? `<a href="${url}">` : "";
  html = html
    .replace(/&lt;a href=&quot;([^&"]+)&quot;&gt;/g, (_m, url: string) => linkOpen(url))
    .replace(/&lt;a href="([^"]+)"&gt;/g, (_m, url: string) => linkOpen(url))
    .replaceAll("&lt;/a&gt;", "</a>");

  return html;
}

/** ВКонтакте разметку не поддерживает — отдаём чистый текст, ссылки выносим в скобки. */
export function toPlainText(raw: string): string {
  return raw
    .replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_match, url, text) =>
      text.trim() === url ? url : `${text} (${url})`,
    )
    .replace(/<\/?(?:b|i|u|s|code)>/g, "")
    .trim();
}

/** Пустой ли текст после снятия разметки. */
export function isBlankMessage(raw: string): boolean {
  return toPlainText(raw).replace(/\s/g, "").length === 0;
}

export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_CAPTION_LIMIT = 1024;
