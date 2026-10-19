import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSetting, SETTING_ANTHROPIC_KEY, SETTING_GEMINI_KEY } from "@/lib/settings";

const MODEL = "claude-opus-5-5";
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-pro";

/** Текст сообщения в чате помощника (история хранится на клиенте). */
export type AssistantTurn = { role: "user" | "assistant"; text: string };

export type AssistantFile = {
  name: string;
  mime: string;
  bytes: Buffer;
};

const nullableText = z.string().nullable();

const ButtonSchema = z.object({
  label: z.string(),
  /** id существующего блока или ref нового из этого же ответа */
  target: nullableText,
  url: nullableText,
});

const ConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "ne", "contains", "empty", "notEmpty", "gt", "lt"]),
  value: nullableText,
  target: nullableText,
});

const OperationSchema = z.object({
  action: z.enum(["add", "update", "delete"]),
  /** Для add: временное имя, на которое ссылаются другие операции. */
  ref: nullableText,
  /** Для update/delete: id существующего блока. */
  id: nullableText,
  kind: z.enum(["MESSAGE", "REQUEST", "CODE", "CONDITION", "DELAY", "HANDOFF", "INPUT"]).nullable(),
  title: nullableText,
  text: nullableText,
  keywords: z.array(z.string()).nullable(),
  isStart: z.boolean().nullable(),
  buttons: z.array(ButtonSchema).nullable(),
  /** Куда идти дальше: id или ref. */
  next: nullableText,
  /** Имя приложенного файла-картинки, которую прикрепить к блоку. */
  imageFile: nullableText,
  inputKind: z.enum(["text", "date", "phone", "email", "city"]).nullable(),
  inputError: nullableText,
  saveAs: nullableText,
  method: z.enum(["GET", "POST"]).nullable(),
  url: nullableText,
  headers: nullableText,
  body: nullableText,
  code: nullableText,
  conditions: z.array(ConditionSchema).nullable(),
  delaySeconds: z.number().int().nullable(),
  listSource: nullableText,
  listTemplate: nullableText,
  listEmpty: nullableText,
  listLimit: z.number().int().nullable(),
});

const ResponseSchema = z.object({
  /** Ответ человеку: что сделано или уточняющий вопрос. По-русски, коротко. */
  message: z.string(),
  operations: z.array(OperationSchema),
});

type Operation = z.infer<typeof OperationSchema>;

const SYSTEM_PROMPT = `Ты — помощник в конструкторе сценариев для ботов Telegram и ВКонтакте компании «Квиз, плиз!» (барные квизы).
Пользователь диктует, что должен делать бот, а ты превращаешь это в блоки сценария и возвращаешь операции.

Виды блоков:
- MESSAGE — сообщение с кнопками. Кнопка ведёт на другой блок (target) или открывает сайт (url). Сообщение без кнопок может сразу перейти к блоку next.
- INPUT — вопрос, ответ сохраняется в переменную saveAs. inputKind: text, date, phone, email, city (телефон/e-mail/город записываются в карточку человека). inputError — текст, если ответ не подошёл. next — куда идти после ответа.
- CONDITION — развилка по данным человека (conditions: field/operator/value/target), иначе — next. Поля: name, phone, email, city и любые сохранённые переменные.
- REQUEST — HTTP-запрос (method, url, headers в формате «Key: value» построчно, body), результат в переменную saveAs, затем next.
- CODE — свой JavaScript: доступен объект vars, возвращённый объект записывается в переменные; затем next.
- DELAY — пауза delaySeconds, затем next.
- HANDOFF — передать диалог живому оператору (text — что написать человеку).

Правила:
- В тексте можно подставлять переменные: {{name}}, {{city}}, {{phone}}, {{email}}, {{today}}, {{tomorrow}}, {{weekEnd}}. Разметка Telegram: <b>, <i>, <u>, <a href="">. Во ВКонтакте разметка убирается автоматически.
- Списки из данных запроса: listSource (путь к массиву, например games.games), listTemplate (шаблон одного элемента), listEmpty, listLimit; в тексте — {{list}}.
- Один стартовый блок (isStart). Ключевые слова keywords запускают блок по сообщению человека.
- Для новых блоков задавай ref (латиницей, уникально) и ссылайся на него в target/next других операций. На существующие блоки ссылайся по их id.
- Кнопка «назад в меню» ведёт на стартовый блок существующего сценария, если он есть.
- Если прикреплён файл-картинка, его можно прикрепить к блоку через imageFile (имя файла как есть).
- Тексты пиши живо и по-русски, с эмодзи умеренно, без канцелярита. Не выдумывай ссылки и адреса — спроси.
- Не трогай блоки, о которых не просили. Если задача неясна — задай уточняющий вопрос в message и верни пустой operations.
- Поля, которые не меняешь, оставляй null.`;

type ScenarioForPrompt = {
  id: string;
  title: string;
  platform: string;
  blocks: {
    id: string;
    kind: string;
    title: string;
    isStart: boolean;
    keywords: string[];
    text: string;
    next: string | null;
    buttons: { label: string; target: string | null; url: string | null }[];
    inputKind: string | null;
    saveAs: string | null;
    hasImage: boolean;
  }[];
};

async function loadScenario(scenarioId: string): Promise<ScenarioForPrompt | null> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      bot: true,
      blocks: {
        orderBy: [{ isStart: "desc" }, { createdAt: "asc" }],
        include: { buttons: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!scenario) return null;
  return {
    id: scenario.id,
    title: scenario.title,
    platform: scenario.bot.platform,
    blocks: scenario.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title,
      isStart: block.isStart,
      keywords: block.keywords,
      text: block.text.slice(0, 400),
      next: block.nextBlockId,
      buttons: block.buttons.map((button) => ({
        label: button.label,
        target: button.targetBlockId,
        url: button.url,
      })),
      inputKind: block.inputKind,
      saveAs: block.saveAs,
      hasImage: Boolean(block.imageId),
    })),
  };
}

function headersFromText(text: string | null): Record<string, string> | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    /* построчный формат */
  }
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const index = line.indexOf(":");
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return Object.keys(result).length ? result : undefined;
}

/** Применяет операции помощника к сценарию. Возвращает список сделанного. */
export async function applyOperations(
  scenarioId: string,
  operations: Operation[],
  files: AssistantFile[],
): Promise<string[]> {
  const log: string[] = [];
  const refs = new Map<string, string>();
  const existing = await prisma.scenarioBlock.findMany({
    where: { scenarioId },
    select: { id: true, positionX: true, positionY: true },
  });
  const known = new Set(existing.map((block) => block.id));
  let nextX = existing.length ? Math.max(...existing.map((block) => block.positionX)) + 360 : 40;
  let nextY = 40;

  const resolve = (value: string | null): string | null => {
    if (!value) return null;
    if (refs.has(value)) return refs.get(value)!;
    return known.has(value) ? value : null;
  };

  const imageIdFor = async (name: string | null): Promise<string | null | undefined> => {
    if (!name) return undefined;
    const file = files.find((item) => item.name === name && item.mime.startsWith("image/"));
    if (!file) return undefined;
    const created = await prisma.mediaFile.create({
      data: {
        filename: file.name,
        mime: file.mime,
        size: file.bytes.length,
        data: new Uint8Array(file.bytes),
        scope: "scenario",
      },
    });
    return created.id;
  };

  // 1. Сначала создаём новые блоки — чтобы ссылки на них можно было разрешить.
  for (const op of operations) {
    if (op.action !== "add") continue;
    const block = await prisma.scenarioBlock.create({
      data: {
        scenarioId,
        kind: op.kind ?? "MESSAGE",
        title: op.title ?? "Новый экран",
        text: op.text ?? "",
        positionX: nextX,
        positionY: nextY,
      },
    });
    nextY += 240;
    if (nextY > 1200) {
      nextY = 40;
      nextX += 360;
    }
    known.add(block.id);
    if (op.ref) refs.set(op.ref, block.id);
    log.push(`Добавлен блок «${block.title}»`);
  }

  // 2. Заполняем поля и связи (и у новых, и у изменяемых).
  for (const op of operations) {
    if (op.action === "delete") {
      const id = resolve(op.id);
      if (!id) continue;
      const removed = await prisma.scenarioBlock.delete({ where: { id } });
      known.delete(id);
      log.push(`Удалён блок «${removed.title}»`);
      continue;
    }

    const id = op.action === "add" ? resolve(op.ref) : resolve(op.id);
    if (!id) continue;

    if (op.isStart) {
      await prisma.scenarioBlock.updateMany({
        where: { scenarioId, isStart: true },
        data: { isStart: false },
      });
    }

    const imageId = await imageIdFor(op.imageFile);
    const conditions = op.conditions?.map((rule) => ({
      field: rule.field,
      operator: rule.operator,
      value: rule.value ?? "",
      targetBlockId: resolve(rule.target),
    }));

    const headers = headersFromText(op.headers);
    await prisma.scenarioBlock.update({
      where: { id },
      data: {
        ...(op.kind ? { kind: op.kind } : {}),
        ...(op.title !== null ? { title: op.title } : {}),
        ...(op.text !== null ? { text: op.text } : {}),
        ...(op.keywords ? { keywords: op.keywords } : {}),
        ...(op.isStart !== null ? { isStart: op.isStart } : {}),
        ...(op.next !== null ? { nextBlockId: resolve(op.next) } : {}),
        ...(imageId !== undefined ? { imageId } : {}),
        ...(op.inputKind ? { inputKind: op.inputKind } : {}),
        ...(op.inputError !== null ? { inputError: op.inputError } : {}),
        ...(op.saveAs !== null ? { saveAs: op.saveAs } : {}),
        ...(op.method ? { method: op.method } : {}),
        ...(op.url !== null ? { url: op.url } : {}),
        ...(headers ? { headers } : {}),
        ...(op.body !== null ? { body: op.body } : {}),
        ...(op.code !== null ? { code: op.code } : {}),
        ...(conditions ? { conditions } : {}),
        ...(op.delaySeconds !== null ? { delaySeconds: op.delaySeconds } : {}),
        ...(op.listSource !== null ? { listSource: op.listSource } : {}),
        ...(op.listTemplate !== null ? { listTemplate: op.listTemplate } : {}),
        ...(op.listEmpty !== null ? { listEmpty: op.listEmpty } : {}),
        ...(op.listLimit !== null ? { listLimit: op.listLimit } : {}),
      },
    });

    if (op.buttons) {
      await prisma.scenarioButton.deleteMany({ where: { blockId: id } });
      if (op.buttons.length) {
        await prisma.scenarioButton.createMany({
          data: op.buttons.map((button, index) => ({
            blockId: id,
            label: button.label,
            position: index,
            url: button.url || null,
            targetBlockId: button.url ? null : resolve(button.target),
          })),
        });
      }
    }

    if (op.action === "update") {
      const block = await prisma.scenarioBlock.findUnique({ where: { id }, select: { title: true } });
      log.push(`Изменён блок «${block?.title ?? id}»`);
    }
  }

  return log;
}

export type AssistantResult = {
  reply: string;
  applied: string[];
  error?: string;
};

type ModelReply = { parsed?: z.infer<typeof ResponseSchema>; error?: string };

/** Схема ответа в формате Gemini (подмножество OpenAPI) — зеркало ResponseSchema. */
const GEMINI_SCHEMA = (() => {
  const text = { type: "STRING", nullable: true };
  const button = {
    type: "OBJECT",
    properties: { label: { type: "STRING" }, target: text, url: text },
    required: ["label", "target", "url"],
  };
  const condition = {
    type: "OBJECT",
    properties: {
      field: { type: "STRING" },
      operator: { type: "STRING", enum: ["eq", "ne", "contains", "empty", "notEmpty", "gt", "lt"] },
      value: text,
      target: text,
    },
    required: ["field", "operator", "value", "target"],
  };
  const operationProperties: Record<string, unknown> = {
    action: { type: "STRING", enum: ["add", "update", "delete"] },
    ref: text,
    id: text,
    kind: {
      type: "STRING",
      enum: ["MESSAGE", "REQUEST", "CODE", "CONDITION", "DELAY", "HANDOFF", "INPUT"],
      nullable: true,
    },
    title: text,
    text,
    keywords: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
    isStart: { type: "BOOLEAN", nullable: true },
    buttons: { type: "ARRAY", items: button, nullable: true },
    next: text,
    imageFile: text,
    inputKind: { type: "STRING", enum: ["text", "date", "phone", "email", "city"], nullable: true },
    inputError: text,
    saveAs: text,
    method: { type: "STRING", enum: ["GET", "POST"], nullable: true },
    url: text,
    headers: text,
    body: text,
    code: text,
    conditions: { type: "ARRAY", items: condition, nullable: true },
    delaySeconds: { type: "INTEGER", nullable: true },
    listSource: text,
    listTemplate: text,
    listEmpty: text,
    listLimit: { type: "INTEGER", nullable: true },
  };
  return {
    type: "OBJECT",
    properties: {
      message: { type: "STRING" },
      operations: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: operationProperties,
          required: Object.keys(operationProperties),
        },
      },
    },
    required: ["message", "operations"],
  };
})();

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Запрос к Gemini через REST: системная подсказка, история, файлы, JSON по схеме. */
export async function askGemini(params: {
  apiKey: string;
  history: AssistantTurn[];
  userParts: GeminiPart[];
  model?: string;
}): Promise<ModelReply> {
  const model = params.model ?? GEMINI_MODEL;
  const contents = [
    ...params.history.map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: params.userParts },
  ];

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": params.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_SCHEMA,
            temperature: 0.4,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch (error) {
    // Зависший запрос к превью-модели — повторяем на стабильной.
    if (model !== GEMINI_FALLBACK_MODEL) return askGemini({ ...params, model: GEMINI_FALLBACK_MODEL });
    return { error: `Gemini недоступен: ${(error as Error).message}` };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    // Превью-модель может быть недоступна для ключа — пробуем стабильную.
    if (model !== GEMINI_FALLBACK_MODEL && (response.status === 404 || response.status === 400)) {
      return askGemini({ ...params, model: GEMINI_FALLBACK_MODEL });
    }
    if (response.status === 401 || response.status === 403) {
      return { error: `Ключ Gemini не принят: ${message}` };
    }
    if (response.status === 429) return { error: "Лимит запросов к Gemini — попробуйте через минуту" };
    return { error: `Ошибка Gemini (${response.status}): ${message}` };
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) {
    return { error: `Gemini не дал ответа${data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ""}` };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "Gemini вернул не JSON — попробуйте переформулировать" };
  }
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) return { error: "Ответ Gemini не подошёл под схему — попробуйте ещё раз" };
  return { parsed: parsed.data };
}

/** Один ход диалога с помощником: читает сценарий, спрашивает Claude, применяет операции. */
export async function runAssistant(params: {
  scenarioId: string;
  history: AssistantTurn[];
  message: string;
  files: AssistantFile[];
}): Promise<AssistantResult> {
  const [apiKey, geminiKey] = await Promise.all([
    getSetting(SETTING_ANTHROPIC_KEY),
    getSetting(SETTING_GEMINI_KEY),
  ]);
  if (!apiKey && !geminiKey) {
    return { reply: "", applied: [], error: "Не задан ключ Anthropic или Gemini — раздел «Настройки»." };
  }

  const scenario = await loadScenario(params.scenarioId);
  if (!scenario) return { reply: "", applied: [], error: "Сценарий не найден" };

  const context =
    `Текущий сценарий «${scenario.title}» для платформы ${scenario.platform}.\n` +
    `Блоки (JSON):\n${JSON.stringify(scenario.blocks, null, 1)}`;

  // Приложенные файлы: картинки показываем модели, текст и PDF — отдаём как документы.
  const attachments: Anthropic.ContentBlockParam[] = [];
  const fileNotes: string[] = [];
  for (const file of params.files) {
    if (file.mime.startsWith("image/")) {
      const mediaType = file.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) continue;
      attachments.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: file.bytes.toString("base64") },
      });
      fileNotes.push(`Картинка «${file.name}» — можно прикрепить к блоку через imageFile.`);
    } else if (file.mime === "application/pdf") {
      attachments.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") },
      });
      fileNotes.push(`Документ «${file.name}».`);
    } else if (file.mime.startsWith("text/") || /\.(md|csv|txt|json)$/i.test(file.name)) {
      fileNotes.push(`Файл «${file.name}»:\n${file.bytes.toString("utf8").slice(0, 20000)}`);
    }
  }

  const userText = [context, ...fileNotes, `Задача: ${params.message}`].join("\n\n");

  // Без ключа Anthropic работаем через Gemini.
  if (!apiKey && geminiKey) {
    const userParts: GeminiPart[] = [
      ...params.files
        .filter((file) => file.mime.startsWith("image/") || file.mime === "application/pdf")
        .map((file) => ({
          inlineData: { mimeType: file.mime, data: file.bytes.toString("base64") },
        })),
      { text: userText },
    ];
    const reply = await askGemini({ apiKey: geminiKey, history: params.history, userParts });
    if (reply.error || !reply.parsed) return { reply: "", applied: [], error: reply.error };
    const applied = await applyOperations(params.scenarioId, reply.parsed.operations, params.files);
    return { reply: reply.parsed.message, applied };
  }

  const client = new Anthropic({ apiKey: apiKey! });
  const messages: Anthropic.MessageParam[] = params.history.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  messages.push({
    role: "user",
    content: [...attachments, { type: "text", text: userText }],
  });

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort: "medium", format: zodOutputFormat(ResponseSchema) },
    });

    if (response.stop_reason === "refusal") {
      return { reply: "", applied: [], error: "Модель отказалась выполнять запрос" };
    }
    const parsed = response.parsed_output;
    if (!parsed) return { reply: "", applied: [], error: "Не удалось разобрать ответ модели" };

    const applied = await applyOperations(params.scenarioId, parsed.operations, params.files);
    return { reply: parsed.message, applied };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { reply: "", applied: [], error: "Ключ Anthropic не принят — проверьте в «Настройках»" };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { reply: "", applied: [], error: "Лимит запросов к Claude — попробуйте через минуту" };
    }
    if (error instanceof Anthropic.APIError) {
      return { reply: "", applied: [], error: `Ошибка Claude API ${error.status}: ${error.message}` };
    }
    return { reply: "", applied: [], error: (error as Error).message };
  }
}
