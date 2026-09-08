/** Приводит телефон к виду +79991234567. Возвращает null, если это не похоже на номер. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 8 999 ... и 7 999 ... — это один и тот же российский номер.
  if (!hasPlus && digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length === 10 && !hasPlus) {
    digits = "7" + digits; // номер без кода страны считаем российским
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return "+" + digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/** Ключ города: «Санкт-Петербург», «санкт петербург», «СПб.» → одинаковый slug для первых двух. */
export function citySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= 120 ? name : null;
}
