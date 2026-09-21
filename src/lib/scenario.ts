import type { Bot, Subscriber } from "@/generated/prisma/client";
import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import {
  TELEGRAM_CAPTION_LIMIT,
  toPlainText,
  toTelegramHtml,
} from "@/lib/message-format";
import { sendMessage, sendTelegramPhotoByRef, uploadVkPhoto } from "@/lib/platforms";
import { parseRules, pickBranch } from "@/lib/conditions";
import { resolveExplicitTarget, resolveTarget } from "@/lib/scenario-routing";
import { runUserCode } from "@/lib/run-code";
import { runRequest } from "@/lib/run-request";
import { parseInput, type InputKind, type ParsedInput } from "@/lib/input-parse";
import { validateCity } from "@/lib/cities";
import { ingestContact } from "@/lib/contacts";
import { buildScope, render, renderMessage, type VariableScope } from "@/lib/template";

/** Защита от сценария, замкнутого в кольцо из запросов и кода. */
const MAX_CHAIN_STEPS = 10;

type ScenarioBlock = {
  id: string;
  isStart: boolean;
  keywords: string[];
  kind: "MESSAGE" | "REQUEST" | "CODE" | "CONDITION" | "DELAY" | "HANDOFF" | "INPUT";
  text: string;
  imageId: string | null;
  method: string | null;
  url: string | null;
  headers: unknown;
  body: string | null;
  saveAs: string | null;
  code: string | null;
  conditions: unknown;
  inputKind: string | null;
  inputError: string | null;
  delaySeconds: number | null;
  listSource: string | null;
  listTemplate: string | null;
  listEmpty: string | null;
  listLimit: number | null;
  nextBlockId: string | null;
  buttons: {
    id: string;
    label: string;
    targetBlockId: string | null;
    url: string | null;
    position: number;
  }[];
};


export async function getActiveScenario(botId: string) {
  return prisma.scenario.findFirst({
    where: { botId, isActive: true },
    include: {
      blocks: {
        orderBy: { createdAt: "asc" },
        include: { buttons: { orderBy: { position: "asc" } } },
      },
    },
  });
}

/** Отправляет экран сценария: картинку, текст и кнопки под ним. */
export async function sendBlock(
  bot: Bot,
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId" | "botId">,
  block: ScenarioBlock,
  scope: VariableScope = {},
): Promise<{ ok: boolean; error?: string }> {
  const raw = renderMessage(block.text, block, scope);
  // В Telegram отдаём разметку, во ВКонтакте — чистый текст: там оформления нет.
  const text = bot.platform === "TELEGRAM" ? toTelegramHtml(raw) : toPlainText(raw);
  const keyboard = block.buttons.map((button) => ({
    id: button.id,
    label: toPlainText(render(button.label, scope)),
    url: button.url ? render(button.url, scope) : null,
  }));
  let error: string | undefined;
  let textSent = false;

  if (block.imageId) {
    const image = await prisma.mediaFile.findUnique({ where: { id: block.imageId } });

    if (image && bot.platform === "TELEGRAM") {
      // Подпись к фото в Telegram ограничена — длинный текст уйдёт отдельным сообщением.
      const captionFits = text.length <= TELEGRAM_CAPTION_LIMIT;
      const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
      const reference = image.telegramFileId ?? `${base}/api/media/${image.id}`;

      const result = await sendTelegramPhotoByRef(
        bot,
        subscriber.externalId,
        reference,
        captionFits ? text : "",
        { keyboard: captionFits ? keyboard : [], html: true },
      );

      if (result.ok) {
        textSent = captionFits;
        // Дальше эту картинку шлём по file_id, без повторной загрузки.
        if (result.fileId && result.fileId !== image.telegramFileId) {
          await prisma.mediaFile.update({
            where: { id: image.id },
            data: { telegramFileId: result.fileId },
          });
        }
      } else {
        error = result.error;
      }
    } else if (image && bot.token) {
      let attachment = image.vkAttachment;
      if (!attachment) {
        const uploaded = await uploadVkPhoto(bot.token, subscriber.externalId, {
          bytes: Buffer.from(image.data),
          filename: image.filename,
          mime: image.mime,
        });
        attachment = uploaded.attachment ?? null;
        if (attachment) {
          await prisma.mediaFile.update({
            where: { id: image.id },
            data: { vkAttachment: attachment },
          });
        } else {
          error = uploaded.error;
        }
      }

      if (attachment) {
        const result = await sendMessage(bot, subscriber.externalId, text, {
          attachment,
          keyboard,
        });
        textSent = result.ok;
        if (!result.ok) error = result.error;
      }
    }
  }

  if (!textSent) {
    const result = await sendMessage(bot, subscriber.externalId, text, {
      keyboard,
      html: bot.platform === "TELEGRAM",
    });
    if (!result.ok) error = result.error;
  }

  if (!error) {
    await logMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      contactId: subscriber.contactId,
      direction: "OUT",
      text: block.imageId ? `[картинка] ${toPlainText(raw)}` : toPlainText(raw),
    });
    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: { currentBlockId: block.id },
    });
  }

  return { ok: !error, error };
}

/** Сохраняет посчитанные переменные в карточке человека. */
async function saveVariables(contactId: string, patch: Record<string, unknown>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { variables: true },
  });
  const current =
    contact?.variables && typeof contact.variables === "object" && !Array.isArray(contact.variables)
      ? (contact.variables as Record<string, unknown>)
      : {};

  await prisma.contact.update({
    where: { id: contactId },
    // Prisma ждёт значение, пригодное для JSON-колонки: прогоняем через сериализацию.
    data: { variables: JSON.parse(JSON.stringify({ ...current, ...patch })) },
  });
}

/**
 * Идёт по цепочке блоков: запросы и код выполняются молча и ведут дальше,
 * а сообщение отправляется человеку и останавливает цепочку до его ответа.
 */
async function runChain(
  bot: Bot,
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId" | "botId">,
  blocks: ScenarioBlock[],
  start: ScenarioBlock,
  scope: VariableScope,
): Promise<void> {
  let current: ScenarioBlock | null = start;
  let workingScope = scope;

  for (let step = 0; step < MAX_CHAIN_STEPS && current; step += 1) {
    if (current.kind === "MESSAGE") {
      const sent = await sendBlock(bot, subscriber, current, workingScope);
      // Сообщение без кнопок с переходом «дальше» — просто ступенька: идём к следующему блоку.
      if (sent.ok && current.buttons.length === 0 && current.nextBlockId) {
        current = blocks.find((block) => block.id === current!.nextBlockId) ?? null;
        continue;
      }
      return;
    }

    if (current.kind === "CONDITION") {
      const rules = parseRules(current.conditions);
      const branch = pickBranch(rules, workingScope);
      // Ни одно правило не сработало — идём по ветке «иначе».
      const nextId: string | null = branch ?? current.nextBlockId;
      current = nextId ? (blocks.find((block) => block.id === nextId) ?? null) : null;
      continue;
    }

    if (current.kind === "DELAY") {
      const seconds = Math.max(1, current.delaySeconds ?? 1);
      if (current.nextBlockId) {
        await prisma.scheduledStep.create({
          data: {
            subscriberId: subscriber.id,
            blockId: current.nextBlockId,
            runAt: new Date(Date.now() + seconds * 1000),
          },
        });
      }
      return;
    }

    if (current.kind === "INPUT") {
      // Задаём вопрос и останавливаемся: ответ придёт следующим сообщением.
      await sendBlock(bot, subscriber, current, workingScope);
      return;
    }

    if (current.kind === "HANDOFF") {
      await prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { needsOperator: true, operatorSince: new Date() },
      });
      if (current.text.trim()) {
        await sendBlock(bot, subscriber, current, workingScope);
      }
      return;
    }

    const patch: Record<string, unknown> = {};

    if (current.kind === "REQUEST") {
      const result = await runRequest(current, workingScope);
      const key = current.saveAs?.trim() || "response";
      patch[key] = result.ok ? result.data : null;
      patch[`${key}_ok`] = result.ok;
      if (result.status) patch[`${key}_status`] = result.status;
      if (result.error) patch[`${key}_error`] = result.error;
    } else if (current.kind === "CODE" && current.code) {
      const result = runUserCode(current.code, workingScope);
      if (result.vars) Object.assign(patch, result.vars);
      if (result.error) patch.code_error = result.error;
    }

    await saveVariables(subscriber.contactId, patch);
    workingScope = { ...workingScope, ...patch };

    current = current.nextBlockId
      ? (blocks.find((block) => block.id === current!.nextBlockId) ?? null)
      : null;
  }
}

/**
 * Пропускает входящее сообщение через сценарий бота.
 * Возвращает false, если активного сценария нет — тогда работает прежняя логика.
 */
export async function handleScenarioMessage(params: {
  bot: Bot;
  subscriber: Pick<
    Subscriber,
    "id" | "externalId" | "contactId" | "botId" | "currentBlockId" | "username" | "needsOperator"
  >;
  text: string;
}): Promise<boolean> {
  const scenario = await getActiveScenario(params.bot.id);
  if (!scenario || scenario.blocks.length === 0) return false;

  // Диалог ведёт живой человек — бот не перебивает свободную переписку.
  // Но если человек сам нажал кнопку меню или написал «Начать» —
  // он хочет вернуться к боту, и ждать оператора тут незачем.
  if (params.subscriber.needsOperator) {
    const wantsBot = resolveExplicitTarget(
      scenario.blocks,
      params.subscriber.currentBlockId,
      params.text,
    );
    if (!wantsBot) return true;
    await prisma.subscriber.update({
      where: { id: params.subscriber.id },
      data: { needsOperator: false, operatorSince: null },
    });
  }

  const current = scenario.blocks.find(
    (block) => block.id === params.subscriber.currentBlockId,
  );

  // Стоим на вопросе — значит сообщение человека и есть ответ,
  // если только он не нажал кнопку выхода (её обработает обычная логика).
  const pressedKnownButton = scenario.blocks.some((block) =>
    block.buttons.some(
      (button) => button.label.trim().toLowerCase() === params.text.trim().toLowerCase(),
    ),
  );

  if (current?.kind === "INPUT" && !pressedKnownButton) {
    return handleAnswer(params.bot, params.subscriber, scenario.blocks, current, params.text);
  }

  const target = resolveTarget(scenario.blocks, params.subscriber.currentBlockId, params.text);
  if (!target) return true;

  const contact = await prisma.contact.findUnique({
    where: { id: params.subscriber.contactId },
    include: { city: true },
  });

  const scope = buildScope({
    name: contact?.name,
    phone: contact?.phone,
    email: contact?.email,
    city: contact?.city?.name,
    username: params.subscriber.username,
    externalId: params.subscriber.externalId,
    variables: contact?.variables,
  });

  await runChain(params.bot, params.subscriber, scenario.blocks, target, {
    ...scope,
    message: params.text,
  });

  return true;
}


/** Запускает сценарий с конкретного блока — используется отложенными шагами. */
export async function runFromBlock(subscriberId: string, blockId: string): Promise<void> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    include: { bot: true, contact: { include: { city: true } } },
  });
  if (!subscriber || subscriber.needsOperator) return;

  const scenario = await getActiveScenario(subscriber.botId);
  const block = scenario?.blocks.find((item) => item.id === blockId);
  if (!scenario || !block) return;

  const scope = buildScope({
    name: subscriber.contact.name,
    phone: subscriber.contact.phone,
    email: subscriber.contact.email,
    city: subscriber.contact.city?.name,
    username: subscriber.username,
    externalId: subscriber.externalId,
    variables: subscriber.contact.variables,
  });

  await runChain(subscriber.bot, subscriber, scenario.blocks, block, scope);
}


/** Разбирает ответ человека на вопрос и ведёт дальше по сценарию. */
async function handleAnswer(
  bot: Bot,
  subscriber: Pick<Subscriber, "id" | "externalId" | "contactId" | "botId" | "username">,
  blocks: ScenarioBlock[],
  block: ScenarioBlock,
  text: string,
): Promise<boolean> {
  const kind = (block.inputKind ?? "text") as InputKind;
  const parsed: ParsedInput =
    kind === "city"
      ? await (async () => {
          const city = await validateCity(text);
          return city
            ? { ok: true, value: city }
            : { ok: false, error: "Не нашёл такого города. Напишите, например: Самара" };
        })()
      : parseInput(kind, text);

  if (!parsed.ok) {
    // Не поняли ответ — переспрашиваем своим текстом, оставаясь на этом же вопросе.
    const reply = block.inputError?.trim() || parsed.error || "Не понял ответ.";
    await sendMessage(bot, subscriber.externalId, reply, {});
    await logMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      contactId: subscriber.contactId,
      direction: "OUT",
      text: reply,
    });
    return true;
  }

  const key = block.saveAs?.trim() || "answer";
  const patch: Record<string, unknown> = { [key]: parsed.value };
  if (parsed.extra) patch[`${key}_iso`] = parsed.extra;
  await saveVariables(subscriber.contactId, patch);

  // Телефон, e-mail и город — это данные карточки, а не просто переменные.
  if (kind === "phone" || kind === "email" || kind === "city") {
    await ingestContact({
      botId: bot.id,
      externalId: subscriber.externalId,
      phone: kind === "phone" ? parsed.value : undefined,
      email: kind === "email" ? parsed.value : undefined,
      city: kind === "city" ? parsed.value : undefined,
    });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: subscriber.contactId },
    include: { city: true },
  });

  const scope = {
    ...buildScope({
      name: contact?.name,
      phone: contact?.phone,
      email: contact?.email,
      city: contact?.city?.name,
      username: subscriber.username,
      externalId: subscriber.externalId,
      variables: contact?.variables,
    }),
    ...patch,
    message: text,
  };

  const next = block.nextBlockId
    ? blocks.find((item) => item.id === block.nextBlockId)
    : undefined;
  if (!next) return true;

  await runChain(bot, subscriber, blocks, next, scope);
  return true;
}
