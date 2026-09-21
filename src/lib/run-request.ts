import { render, type VariableScope } from "@/lib/template";

const TIMEOUT_MS = 10000;
const MAX_BODY = 100_000;

export type RequestResult = {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
};

/** Выполняет HTTP-запрос блока: адрес, заголовки и тело поддерживают {{переменные}}. */
export async function runRequest(
  block: { method?: string | null; url?: string | null; headers?: unknown; body?: string | null },
  scope: VariableScope,
): Promise<RequestResult> {
  const url = render(block.url ?? "", scope).trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Нужен адрес, начинающийся с http(s)://" };

  const method = (block.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};

  if (block.headers && typeof block.headers === "object") {
    for (const [key, value] of Object.entries(block.headers as Record<string, unknown>)) {
      headers[key] = render(String(value), scope);
    }
  }

  const rawBody = block.body ? render(block.body, scope) : "";
  const hasBody = method !== "GET" && method !== "HEAD" && rawBody.trim().length > 0;
  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: hasBody ? rawBody : undefined,
      signal: controller.signal,
    });

    const text = (await response.text()).slice(0, MAX_BODY);
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // не JSON — оставляем текстом
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const message = (error as Error).name === "AbortError" ? "Сервис не ответил вовремя" : (error as Error).message;
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
