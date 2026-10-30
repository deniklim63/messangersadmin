import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type Bot, type Subscriber } from "@/generated/prisma/client";
import type { Attachment } from "@/lib/attachments";
import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import { handToOperator } from "@/lib/operator";
import { getGeminiKey } from "@/lib/settings";
import { sendMessage, sendTelegramMedia, sendTypingAction } from "@/lib/platforms";

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
- Отвечай на языке человека: по-русски или по-английски. Если человек пишет по-английски — отвечай по-английски, тем же тоном и по тем же правилам (без эмодзи и markdown). Если язык неясен — по-русски.
- Отвечай коротко и по делу.
- Опирайся только на базу знаний и переписку. Не выдумывай цены, ссылки, промокоды, сроки и правила. Если ответа в базе нет — честно скажи, что уточнишь у команды.
- Поле handoff ставь true, когда нужен живой человек: жалоба, ошибка или баг, который не решился по базе техподдержки, изменение данных аккаунта, просьба позвать человека, или вопрос, на который ты не можешь ответить по базе знаний. В таком случае в reply скажи, что передаёшь вопрос команде, и она ответит здесь же.
- Пока собираешь данные для запроса (отмена подписки, возврат, удаление аккаунта) — handoff: false, иначе бот замолчит и не получит данные. Передачу оператору при готовом запросе система делает сама.
- Если часть ответа есть в базе знаний — сначала дай её, и только недостающее передавай команде.
- Технические проблемы (не грузится, нет звука, не приходит код, не прошла оплата) решай по базе техподдержки: шаги списком, каждый с новой строки, сначала самое вероятное. Не больше 3–4 шагов за одно сообщение; если не помогло — следующие.
- Если по базе техподдержки вопрос нужно передать поддержке — handoff: true, а в reply попроси нужные данные из раздела «Когда передавать в поддержку» (без номера карты, паролей и кодов из писем).
- Никогда не проси пароль, код из письма, номер карты или CVC.
- Отмена подписки, возврат денег и удаление аккаунта идут по разделу «Запросы, которые Хоуми передаёт»: собери данные, и только когда есть всё — заполни request. Пока чего-то нет — request: null, handoff: false и попроси недостающее.
- Если человек просто поздоровался или нажал /start — поздоровайся и коротко скажи, чем можешь помочь.`;

export const REQUEST_KINDS = ["cancel_subscription", "refund", "delete_account"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_LABELS: Record<RequestKind, string> = {
  cancel_subscription: "Отмена подписки",
  refund: "Возврат денег",
  delete_account: "Удаление аккаунта",
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING", description: "Ответ человеку" },
    handoff: { type: "BOOLEAN", description: "Нужно передать диалог живому человеку" },
    request: {
      type: "OBJECT",
      nullable: true,
      description:
        "Собранный запрос на отмену подписки, возврат или удаление аккаунта. Только когда все данные получены, иначе null.",
      properties: {
        kind: { type: "STRING", enum: [...REQUEST_KINDS] },
        email: { type: "STRING", description: "E-mail аккаунта" },
        details: { type: "STRING", description: "Остальные собранные данные одной строкой" },
      },
      required: ["kind", "email", "details"],
    },
  },
  required: ["reply", "handoff"],
};

export type CollectedRequest = { kind: RequestKind; email: string; details: string };

function parseRequest(value: unknown): CollectedRequest | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { kind?: unknown; email?: unknown; details?: unknown };
  if (!REQUEST_KINDS.includes(raw.kind as RequestKind)) return null;
  return {
    kind: raw.kind as RequestKind,
    email: typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "",
    details: typeof raw.details === "string" ? raw.details.trim() : "",
  };
}

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

type HomeDoc = "tov" | "knowledge" | "games" | "support" | "requests";

/** Тексты лежат в репозитории: home/tov.md, home/knowledge.md, home/support.md, home/games.md. */
export async function readHomeDoc(doc: HomeDoc): Promise<string> {
  const file = path.join(process.cwd(), "home", `${doc}.md`);
  return readFile(file, "utf8").catch(() => "");
}

export type AiBot = Pick<
  Bot,
  | "id"
  | "title"
  | "platform"
  | "token"
  | "aiModel"
  | "aiPrompt"
  | "aiKnowledge"
  | "aiHandoff"
  | "aiNotifyChatId"
>;

export type AiAnswer =
  | { ok: true; reply: string; handoff: boolean; model: string; request: CollectedRequest | null }
  | { ok: false; error: string };

export async function buildSystemPrompt(bot: Pick<Bot, "aiPrompt" | "aiKnowledge" | "aiHandoff">): Promise<string> {
  const [tone, knowledge, support, requests, games] = await Promise.all([
    bot.aiPrompt?.trim() || readHomeDoc("tov"),
    bot.aiKnowledge?.trim() || readHomeDoc("knowledge"),
    // Техподдержка, запросы и игры в чате — общие для всех ботов, из админки не меняются.
    readHomeDoc("support"),
    readHomeDoc("requests"),
    readHomeDoc("games"),
  ]);
  const handoffRule = bot.aiHandoff
    ? ""
    : "\n- Передача оператору выключена: handoff всегда false, а вместо «передам команде» предложи написать в поддержку.";
  return [tone, "# База знаний\n\n" + knowledge, support, requests, games, RULES + handoffRule]
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
    select: { direction: true, text: true, attachments: true, source: true },
  });
  return rows
    .reverse()
    // Служебные отметки («передал оператору») — не реплики бота.
    .filter((row) => row.source !== "system")
    .map((row) => ({
      role: (row.direction === "IN" ? "user" : "model") as Turn["role"],
      text: describeIncoming(row.text, parseAttachments(row.attachments)),
    }))
    .filter((turn) => turn.text.trim());
}

function parseAttachments(value: unknown): Attachment[] {
  return Array.isArray(value) ? (value as Attachment[]) : [];
}

/** Текст сообщения плюс пометка о вложениях — модель файлы не видит, но должна о них знать. */
function describeIncoming(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const files = attachments
    .map((item) => `${item.name}${item.mime ? ` (${item.mime})` : ""}`)
    .join(", ");
  return `${text.trim()}${text.trim() ? "\n" : ""}[прислал файл: ${files}]`;
}

const PDF_LOOKBACK_DAYS = 7;

/** Последний PDF, который человек прислал в этот диалог за неделю. */
async function findRecentPdf(
  subscriberId: string,
): Promise<{ fileId: string; name: string; at: Date } | null> {
  const rows = await prisma.message.findMany({
    where: {
      subscriberId,
      direction: "IN",
      attachments: { not: Prisma.DbNull },
      createdAt: { gt: new Date(Date.now() - PDF_LOOKBACK_DAYS * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, attachments: true },
  });
  for (const row of rows) {
    const pdf = parseAttachments(row.attachments).find(
      (item) =>
        item.fileId && (item.mime === "application/pdf" || /\.pdf$/i.test(item.name)),
    );
    if (pdf?.fileId) return { fileId: pdf.fileId, name: pdf.name, at: row.createdAt };
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Человек пишет по-английски? По кириллице в тексте: нет её — считаем английским. */
function isEnglish(text: string): boolean {
  return text.trim().length > 0 && !/[а-яё]/i.test(text);
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
  /** Что система знает точно: например, прислан ли PDF. Дописывается в подсказку. */
  facts?: string[];
  model?: string;
}): Promise<AiAnswer> {
  const apiKey = await getGeminiKey();
  if (!apiKey) return { ok: false, error: "Не задан ключ Gemini — раздел «Настройки»" };

  const model = params.model ?? params.bot.aiModel?.trim() ?? DEFAULT_AI_MODEL;
  const system = await buildSystemPrompt(params.bot);
  const who = [
    params.person?.name ? `Имя человека: ${params.person.name}.` : "",
    params.person?.city ? `Город: ${params.person.city}.` : "",
    `Сегодня ${new Date().toLocaleDateString("ru-RU")}.`,
    ...(params.facts ?? []),
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

  let parsed: { reply?: unknown; handoff?: unknown; request?: unknown };
  try {
    parsed = JSON.parse(raw) as { reply?: unknown; handoff?: unknown; request?: unknown };
  } catch {
    return { ok: false, error: "Gemini вернул не JSON" };
  }
  const reply = typeof parsed.reply === "string" ? stripMarkdown(parsed.reply) : "";
  if (!reply) return { ok: false, error: "Gemini вернул пустой ответ" };

  const request = parseRequest(parsed.request);
  return {
    ok: true,
    reply: reply.slice(0, REPLY_LIMIT),
    // Собранный запрос всегда уходит человеку из команды — диалог ему и передаём.
    handoff: (params.bot.aiHandoff && parsed.handoff === true) || request !== null,
    model,
    request,
  };
}

/**
 * Отвечает человеку в боте: показывает «печатает…», спрашивает Gemini,
 * отправляет ответ и пишет его в переписку. Собранный запрос (отмена, возврат,
 * удаление) проверяет и передаёт ответственному; при необходимости передаёт
 * диалог оператору. Ошибки не роняют вебхук — попадают в «Последние события» бота.
 */
export async function replyWithAi(params: {
  bot: AiBot;
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId" | "username" | "firstName" | "lastName">;
  text: string;
  attachments?: Attachment[];
  /** Момент входящего сообщения — история берётся до него. */
  before?: Date;
}): Promise<void> {
  const { bot, subscriber } = params;
  const attachments = params.attachments ?? [];
  await sendTypingAction(bot, subscriber.externalId);

  const [history, contact, pdf] = await Promise.all([
    loadHistory(subscriber.id, params.before),
    prisma.contact.findUnique({
      where: { id: subscriber.contactId },
      select: { name: true, city: { select: { name: true } } },
    }),
    findRecentPdf(subscriber.id),
  ]);

  const facts = [
    pdf
      ? `PDF-файл от человека в этом диалоге есть: «${pdf.name}» (${pdf.at.toLocaleString("ru-RU")}).`
      : "PDF-файлов от человека в этом диалоге нет.",
  ];

  const answer = await generateAiReply({
    bot,
    text: describeIncoming(params.text, attachments),
    history,
    person: { name: contact?.name, city: contact?.city?.name },
    facts,
  });

  if (!answer.ok) {
    await logAiError(bot.id, { subscriberId: subscriber.id, text: params.text.slice(0, 500) }, answer.error);
    return;
  }

  let reply = answer.reply;
  let handoff = answer.handoff;
  let handoffReason = "AI не смог ответить сам";

  // Собранный запрос: сначала проверяем сами, потом передаём ответственному.
  if (answer.request) {
    const outcome = await forwardRequest({
      bot,
      subscriber,
      contactName: contact?.name ?? null,
      request: answer.request,
      pdf,
      english: isEnglish(params.text),
    });
    if (outcome.replyOverride) reply = outcome.replyOverride;
    handoff = outcome.handoff;
    handoffReason = `запрос «${REQUEST_LABELS[answer.request.kind]}» передан ответственному`;
  }

  const sent = await sendMessage(bot, subscriber.externalId, reply);
  if (!sent.ok) {
    await logAiError(
      bot.id,
      { subscriberId: subscriber.id, reply: reply.slice(0, 500) },
      `Не удалось отправить ответ: ${sent.error ?? "платформа не приняла сообщение"}`,
    );
    return;
  }

  await logMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    contactId: subscriber.contactId,
    direction: "OUT",
    text: reply,
    source: "ai",
  });

  if (handoff) {
    await handToOperator(
      { subscriberId: subscriber.id, botId: bot.id, contactId: subscriber.contactId },
      handoffReason,
    );
  }
}

async function logAiError(botId: string, payload: Record<string, string>, error: string): Promise<void> {
  console.error("AI:", error);
  await prisma.webhookEvent
    .create({ data: { botId, source: "ai", payload, error } })
    .catch(() => null);
}

/** Пауза между повторными уведомлениями об одном и том же запросе. */
const REQUEST_DEDUPE_HOURS = 24;

/**
 * Проверяет собранный запрос и шлёт его ответственному. Модель может ошибиться,
 * поэтому e-mail и PDF-чек проверяем сами: без них человеку уходит просьба
 * дослать, а не подтверждение.
 */
async function forwardRequest(params: {
  bot: AiBot;
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId" | "username" | "firstName" | "lastName">;
  contactName: string | null;
  request: CollectedRequest;
  pdf: { fileId: string; name: string; at: Date } | null;
  english: boolean;
}): Promise<{ replyOverride: string | null; handoff: boolean }> {
  const { bot, subscriber, request, pdf, english } = params;

  if (!EMAIL_RE.test(request.email)) {
    return {
      replyOverride: english
        ? "To pass this on I need the e-mail of your account. Please send it here."
        : "Чтобы передать запрос, мне нужен e-mail вашего аккаунта. Напишите его сюда.",
      handoff: false,
    };
  }
  if (request.kind === "refund" && !pdf) {
    return {
      replyOverride: english
        ? "For a refund I need the PDF receipt of the payment. Please send it here as a file (you can download it from the payment e-mail or your banking app), and I will pass everything on right away."
        : "Для возврата нужен PDF-чек об оплате. Пришлите его сюда файлом (его можно скачать из письма об оплате или из банковского приложения), и я сразу передам запрос.",
      handoff: false,
    };
  }

  // Такой же запрос уже ушёл недавно — не дёргаем ответственного повторно.
  const recent = await prisma.aiRequest.findFirst({
    where: {
      subscriberId: subscriber.id,
      kind: request.kind,
      notifiedAt: { gt: new Date(Date.now() - REQUEST_DEDUPE_HOURS * 3_600_000) },
    },
    select: { id: true },
  });
  if (recent) return { replyOverride: confirmationText(english), handoff: true };

  const fileId = request.kind === "refund" ? (pdf?.fileId ?? null) : null;
  const record = await prisma.aiRequest.create({
    data: {
      botId: bot.id,
      subscriberId: subscriber.id,
      kind: request.kind,
      email: request.email,
      details: request.details,
      fileId,
    },
  });

  const failure = async (error: string) => {
    await prisma.aiRequest.update({ where: { id: record.id }, data: { error } }).catch(() => null);
    await logAiError(bot.id, { subscriberId: subscriber.id, kind: request.kind, email: request.email }, error);
    return {
      replyOverride: english
        ? "I could not pass your request on right now. Please write again in a few minutes."
        : "Не получилось передать запрос прямо сейчас. Напишите, пожалуйста, ещё раз через несколько минут.",
      handoff: true,
    };
  };

  const notifyChatId = bot.aiNotifyChatId?.trim();
  if (!notifyChatId) return failure("Не задан адресат запросов (chat_id) в настройках AI бота");

  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const who = [
    params.contactName || [subscriber.firstName, subscriber.lastName].filter(Boolean).join(" ") || "без имени",
    subscriber.username ? `@${subscriber.username}` : "",
    `id ${subscriber.externalId}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [
    `🔔 ${REQUEST_LABELS[request.kind]}`,
    `Бот: ${bot.title}`,
    `Кто: ${who}`,
    `Email: ${request.email}`,
    request.details ? `Детали: ${request.details}` : "",
    request.kind === "refund"
      ? bot.platform === "TELEGRAM"
        ? "Чек: PDF ниже"
        : `Чек: ${base}/api/files/${fileId}`
      : "",
    base ? `Карточка: ${base}/contacts/${subscriber.contactId}` : "",
  ].filter(Boolean);

  const sent = await sendMessage(bot, notifyChatId, lines.join("\n"));
  if (!sent.ok) return failure(`Уведомление не ушло: ${sent.error ?? "платформа не приняла сообщение"}`);

  if (fileId && bot.platform === "TELEGRAM") {
    const file = await prisma.mediaFile.findUnique({ where: { id: fileId } });
    if (file) {
      const doc = await sendTelegramMedia(
        bot,
        notifyChatId,
        "document",
        { bytes: Buffer.from(file.data), filename: file.filename, mime: file.mime },
        `Чек к запросу: ${request.email}`,
      );
      if (!doc.ok) {
        // Текст уже ушёл — файл можно забрать из карточки, это не повод отказывать человеку.
        await logAiError(bot.id, { subscriberId: subscriber.id, fileId }, `Чек не отправился: ${doc.error ?? ""}`);
      }
    }
  }

  await prisma.aiRequest.update({ where: { id: record.id }, data: { notifiedAt: new Date() } });
  // Подтверждение человеку — фиксированный текст, чтобы срок и формулировка не плавали.
  return { replyOverride: confirmationText(english), handoff: true };
}

function confirmationText(english: boolean): string {
  return english
    ? "Done, I've passed everything on. You'll get a reply within 5 working days."
    : "Ок, передал всю информацию. В течение 5 рабочих дней вы получите ответ.";
}
