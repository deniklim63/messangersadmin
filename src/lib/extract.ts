import { normalizePhone } from "@/lib/normalize";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
const PHONE_RE = /\+?\d[\d\s()\-.]{8,20}\d/;

/**
 * Достаёт телефон и e-mail из обычного сообщения.
 * Нужно, когда диалог ведёт чужой бот: пользователь пишет данные ему,
 * а мы подхватываем их из текста, ничего не спрашивая сами.
 */
export function extractContactData(text: string): { phone?: string; email?: string } {
  if (!text) return {};

  const result: { phone?: string; email?: string } = {};

  const email = text.match(EMAIL_RE)?.[0];
  if (email) result.email = email.toLowerCase();

  const phoneCandidate = text.match(PHONE_RE)?.[0];
  if (phoneCandidate) {
    // normalizePhone сам отсеет то, что не похоже на номер: слишком длинное или короткое.
    const phone = normalizePhone(phoneCandidate);
    if (phone) result.phone = phone;
  }

  return result;
}
