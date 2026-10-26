import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Bot, Subscriber } from "@/generated/prisma/client";
import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import { getGeminiKey } from "@/lib/settings";
import { sendMessage, sendTypingAction } from "@/lib/platforms";

/** Модель по умолчанию — быстрая и дешёвая, для чата с людьми этого достаточно. */
export const DEFAULT_AI_MODEL = "gemini-2.5-flash";

export const AI_MODELS: { id: string; label: string }[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — быстрая, по умолчанию" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — умнее, медленнее" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
];

/** Сколько последних сообщений переписки отдаём модели как контекст
 *  (с запасом на игру в города: ходов много, повторять нельзя). */
const HISTORY_LIMIT = 40;
/** Telegram не принимает сообщения длиннее 4096 символов. */
const REPLY_LIMIT = 4000;
const TIMEOUT_MS = 60_000;
/** Паузы перед повторами при временных сбоях Gemini (503, 429, обрыв сети). */
const RETRY_DELAYS_MS = [2_000, 5_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Запрос к Gemini с повтором: временные ошибки и обрывы сети пробуем ещё до двух раз,
 * чтобы человек не остался без ответа из-за секундного сбоя на стороне Google.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === RETRY_DELAYS_MS.length) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Общие правила — не редактируются из админки, чтобы бот не сломался от правки тона. */
const RULES = `Технические правила ответа (важнее всего остального):
- Ты общаешься в чате Telegram или ВКонтакте: отвечай обычным текстом, без markdown-разметки (никаких **, #, таблиц). Абзацы и списки — просто переносами строк.
- Отвечай по-русски, коротко и по делу.
- Опирайся только на базу знаний и переписку. Не выдумывай цены, ссылки, промокоды, сроки и правила. Если ответа в базе нет — честно скажи, что уточнишь у команды.
- Поле handoff ставь true, когда нужен живой человек: возврат денег, отмена или оформление подписки, жалоба, ошибка или баг, изменение данных аккаунта, просьба позвать человека, или вопрос, на который ты не можешь ответить по базе знаний. В таком случае в reply скажи, что передаёшь вопрос команде, и она ответит здесь же.
- Если часть ответа есть в базе знаний — сначала дай её, и только недостающее передавай команде.
- Технические проблемы (не грузится, нет звука, не приходит код, не прошла оплата) решай по базе техподдержки: шаги списком, каждый с новой строки, сначала самое вероятное. Не больше 3–4 шагов за одно сообщение; если не помогло — следующие.
- Если по базе техподдержки вопрос нужно передать поддержке — handoff: true, а в reply попроси нужные данные из раздела «Когда передавать в поддержку» (без номера карты, паролей и кодов из писем).
- Никогда не проси пароль, код из письма, номер карты или CVC.
- Если человек просто поздоровался или нажал /start — поздоровайся и коротко скажи, чем можешь помочь.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING", description: "Ответ человеку" },
    handoff: { type: "BOOLEAN", description: "Нужно передать диалог живому человеку" },
  },
  required: ["reply", "handoff"],
};

/**
 * Модель иногда всё же ставит markdown, который в Telegram и ВК виден как мусор:
 * звёздочки списков и жирного, решётки заголовков. Убираем, не трогая сам текст.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*[*\-•][ \t]+/gm, "• ")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S[^*\n]*?\S)\*(?=[\s).,!?:;]|$)/gm, "$1$2")
    .trim();
}

type HomeDoc = "tov" | "knowledge" | "games" | "support";

/** Тексты лежат в репозитории: home/tov.md, home/knowledge.md, home/support.md, home/games.md. */
export async function readHomeDoc(doc: HomeDoc): Promise<string> {
  const file = path.join(process.cwd(), "home", `${doc}.md`);
  return readFile(file, "utf8").catch(() => "");
}

export type AiBot = Pick<
  Bot,
  "id" | "platform" | "token" | "aiModel" | "aiPrompt" | "aiKnowledge" | "aiHandoff"
>;

export type AiAnswer =
  | { ok: true; reply: string; handoff: boolean; model: string }
  | { ok: false; error: string };

export async function buildSystemPrompt(bot: Pick<Bot, "aiPrompt" | "aiKnowledge" | "aiHandoff">): Promise<string> {
  const [tone, knowledge, support, games] = await Promise.all([
    bot.aiPrompt?.trim() || readHomeDoc("tov"),
    bot.aiKnowledge?.trim() || readHomeDoc("knowledge"),
    // Техподдержка и игры в чате — общие для всех ботов, из админки не меняются.
    readHomeDoc("support"),
    readHomeDoc("games"),
  ]);
  const handoffRule = bot.aiHandoff
    ? ""
    : "\n- Передача оператору выключена: handoff всегда false, а вместо «передам команде» предложи написать в поддержку.";
  return [tone, "# База знаний\n\n" + knowledge, support, games, RULES + handoffRule]
    .filter(Boolean)
    .join("\n\n");
}

export type Turn = { role: "user" | "model"; text: string };

/** Последние сообщения переписки до текущего — чтобы бот помнил, о чём шла речь. */
async function loadHistory(subscriberId: string, before?: Date): Promise<Turn[]> {
  const rows = await prisma.message.findMany({
    where: { subscriberId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { direction: true, text: true },
  });
  return rows
    .reverse()
    .filter((row) => row.text.trim())
    .map((row) => ({ role: row.direction === "IN" ? "user" : "model", text: row.text }));
}

/** Gemini требует чередования ролей: подряд идущие реплики одной стороны склеиваем. */
function mergeTurns(turns: Turn[]): Turn[] {
  const result: Turn[] = [];
  for (const turn of turns) {
    const last = result[result.length - 1];
    if (last && last.role === turn.role) last.text += `\n\n${turn.text}`;
    else result.push({ ...turn });
  }
  // Диалог для модели должен начинаться с реплики человека.
  while (result[0]?.role === "model") result.shift();
  return result;
}

/**
 * Спрашивает Gemini от имени бота. Ничего не отправляет и не пишет в базу —
 * этим же пользуется кнопка «Проверить» в админке.
 */
export async function generateAiReply(params: {
  bot: Pick<Bot, "aiModel" | "aiPrompt" | "aiKnowledge" | "aiHandoff">;
  text: string;
  history?: Turn[];
  person?: { name?: string | null; city?: string | null };
  model?: string;
}): Promise<AiAnswer> {
  const apiKey = await getGeminiKey();
  if (!apiKey) return { ok: false, error: "Не задан ключ Gemini — раздел «Настройки»" };

  const model = params.model ?? params.bot.aiModel?.trim() ?? DEFAULT_AI_MODEL;
  const system = await buildSystemPrompt(params.bot);
  const who = [
    params.person?.name ? `Имя человека: ${params.person.name}.` : "",
    params.person?.city ? `Город: ${params.person.city}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const contents = mergeTurns([
    ...(params.history ?? []),
    { role: "user", text: params.text.trim() || "/start" },
  ]).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));

  let response: Response;
  try {
    response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: who ? `${system}\n\n${who}` : system }] },
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.6,
          },
        }),
      },
    );
  } catch (error) {
    return { ok: false, error: `Gemini недоступен: ${(error as Error).message}` };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    // Выбранная модель недоступна для ключа — отвечаем моделью по умолчанию.
    if (model !== DEFAULT_AI_MODEL && (response.status === 404 || response.status === 400)) {
      return generateAiReply({ ...params, model: DEFAULT_AI_MODEL });
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: `Ключ Gemini не принят: ${message}` };
    }
    if (response.status === 429) return { ok: false, error: "Лимит запросов к Gemini (три попытки)" };
    if (RETRYABLE_STATUSES.has(response.status)) {
      return { ok: false, error: `Gemini недоступен после трёх попыток (${response.status}): ${message}` };
    }
    return { ok: false, error: `Ошибка Gemini (${response.status}): ${message}` };
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!raw) {
    const reason = data.promptFeedback?.blockReason;
    return { ok: false, error: `Gemini не дал ответа${reason ? ` (${reason})` : ""}` };
  }

  let parsed: { reply?: unknown; handoff?: unknown };
  try {
    parsed = JSON.parse(raw) as { reply?: unknown; handoff?: unknown };
  } catch {
    return { ok: false, error: "Gemini вернул не JSON" };
  }
  const reply = typeof parsed.reply === "string" ? stripMarkdown(parsed.reply) : "";
  if (!reply) return { ok: false, error: "Gemini вернул пустой ответ" };

  return {
    ok: true,
    reply: reply.slice(0, REPLY_LIMIT),
    handoff: params.bot.aiHandoff && parsed.handoff === true,
    model,
  };
}

/**
 * Отвечает человеку в боте: показывает «печатает…», спрашивает Gemini,
 * отправляет ответ и пишет его в переписку. При необходимости передаёт
 * диалог оператору. Ошибки не роняют вебхук — попадают в «Последние события» бота.
 */
export async function replyWithAi(params: {
  bot: AiBot;
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId">;
  text: string;
  /** Момент входящего сообщения — история берётся до него. */
  before?: Date;
}): Promise<void> {
  const { bot, subscriber } = params;
  await sendTypingAction(bot, subscriber.externalId);

  const [history, contact] = await Promise.all([
    loadHistory(subscriber.id, params.before),
    prisma.contact.findUnique({
      where: { id: subscriber.contactId },
      select: { name: true, city: { select: { name: true } } },
    }),
  ]);

  const answer = await generateAiReply({
    bot,
    text: params.text,
    history,
    person: { name: contact?.name, city: contact?.city?.name },
  });

  if (!answer.ok) {
    console.error("AI не ответил:", answer.error);
    await prisma.webhookEvent
      .create({
        data: {
          botId: bot.id,
          source: "ai",
          payload: { subscriberId: subscriber.id, text: params.text.slice(0, 500) },
          error: answer.error,
        },
      })
      .catch(() => null);
    return;
  }

  const sent = await sendMessage(bot, subscriber.externalId, answer.reply);
  if (!sent.ok) {
    await prisma.webhookEvent
      .create({
        data: {
          botId: bot.id,
          source: "ai",
          payload: { subscriberId: subscriber.id, reply: answer.reply.slice(0, 500) },
          error: `Не удалось отправить ответ: ${sent.error ?? "платформа не приняла сообщение"}`,
        },
      })
      .catch(() => null);
    return;
  }

  await logMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    contactId: subscriber.contactId,
    direction: "OUT",
    text: answer.reply,
    source: "ai",
  });

  if (answer.handoff) {
    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: { needsOperator: true, operatorSince: new Date() },
    });
  }
}
