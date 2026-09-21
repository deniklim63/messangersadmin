import type { Bot, Contact } from "@/generated/prisma/client";
import { ingestContact, logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import type { Attachment } from "@/lib/attachments";
import { extractContactData } from "@/lib/extract";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { sendMessage } from "@/lib/platforms";
import { handleScenarioMessage } from "@/lib/scenario";

export type SurveyStep = "name" | "phone" | "email" | "city" | "done";

const ORDER: Exclude<SurveyStep, "done">[] = ["name", "phone", "email", "city"];

const QUESTIONS: Record<Exclude<SurveyStep, "done">, string> = {
  name: "Как вас зовут?",
  phone: "Оставьте, пожалуйста, номер телефона — в формате +7 999 123-45-67.",
  email: "Ваш e-mail? Если не хотите оставлять — отправьте «-».",
  city: "Из какого вы города?",
};

const SKIP_WORDS = ["-", "–", "нет", "пропустить", "skip", "не хочу"];

const GREETING = "Привет! Задам четыре коротких вопроса, чтобы занести вас в базу.";
const THANKS = "Спасибо! Всё записал. Если что-то изменится — просто напишите сюда.";

function isSkip(text: string): boolean {
  return SKIP_WORDS.includes(text.trim().toLowerCase());
}

function isStartCommand(text: string): boolean {
  return /^\/?(start|начать|привет)\b/i.test(text.trim());
}

/**
 * Следующий вопрос. Шаг пропускается, если на него уже ответили (closed)
 * или если данные пришли из другого бота — переспрашивать нет смысла.
 * Имя — исключение: имя из профиля Telegram не считается ответом,
 * иначе первый ответ человека уехал бы в следующее поле.
 */
function nextStep(contact: Contact, closed: Set<string>): SurveyStep {
  for (const step of ORDER) {
    if (closed.has(step)) continue;
    if (step === "name") return step;
    if (step === "phone" && !contact.phone) return step;
    if (step === "email" && !contact.email) return step;
    if (step === "city" && !contact.cityId) return step;
  }
  return "done";
}

type IncomingParams = {
  bot: Bot;
  externalId: string;
  text: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Телефон из кнопки «Поделиться контактом». */
  sharedPhone?: string | null;
  /** Город из профиля ВК. */
  profileCity?: string | null;
  messageExternalId?: string | null;
  attachments?: Attachment[];
};

/**
 * Единая обработка входящего сообщения из любого бота:
 * записывает человека, ведёт его по анкете и отвечает следующим вопросом.
 */
export async function handleIncomingMessage(params: IncomingParams) {
  const { bot, externalId, text } = params;

  const { contact, subscriber } = await ingestContact({
    botId: bot.id,
    externalId,
    username: params.username,
    firstName: params.firstName,
    lastName: params.lastName,
    phone: params.sharedPhone,
    city: params.profileCity,
  });

  await logMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    contactId: contact.id,
    direction: "IN",
    text: params.sharedPhone && !text ? `[контакт] ${params.sharedPhone}` : text,
    externalId: params.messageExternalId,
    attachments: params.attachments,
  });

  // Данные из текста подхватываем всегда — сценарий этому не мешает.
  const found = extractContactData(text);
  const enriched =
    found.phone || found.email
      ? (
          await ingestContact({
            botId: bot.id,
            externalId,
            phone: found.phone,
            email: found.email,
            fillEmptyOnly: true,
          })
        ).contact
      : contact;

  // Если у бота включён сценарий — диалог ведёт он.
  const handledByScenario = await handleScenarioMessage({ bot, subscriber, text });
  if (handledByScenario) return { contact: enriched, subscriber };

  if (!bot.collectSurvey) return { contact: enriched, subscriber };

  // Состояние анкеты хранится строкой вида "email|name,phone":
  // текущий вопрос и шаги, которые уже закрыты (отвечены или пропущены).
  const [rawStep, rawClosed] = (subscriber.surveyStep ?? "").split("|");
  const closed = new Set((rawClosed ?? "").split(",").filter(Boolean));
  const currentStep = (rawStep || null) as SurveyStep | null;

  let updated = contact;
  let problem: string | null = null;

  const answering = !isStartCommand(text) && currentStep && currentStep !== "done";
  if (answering) {
    const answer = text.trim();
    if (currentStep === "name") {
      if (isSkip(answer)) {
        closed.add("name");
      } else if (answer) {
        updated = (await ingestContact({ botId: bot.id, externalId, name: answer })).contact;
        closed.add("name");
      }
    } else if (currentStep === "phone") {
      const phone = normalizePhone(params.sharedPhone ?? answer);
      if (phone) {
        updated = (await ingestContact({ botId: bot.id, externalId, phone })).contact;
        closed.add("phone");
      } else if (isSkip(answer)) {
        closed.add("phone");
      } else {
        problem = "Не понял номер. Пример: +7 999 123-45-67";
      }
    } else if (currentStep === "email") {
      if (isSkip(answer)) {
        closed.add("email");
      } else {
        const email = normalizeEmail(answer);
        if (email) {
          updated = (await ingestContact({ botId: bot.id, externalId, email })).contact;
          closed.add("email");
        } else {
          problem = "Это не похоже на e-mail. Пример: name@mail.ru";
        }
      }
    } else if (currentStep === "city") {
      if (isSkip(answer)) {
        closed.add("city");
      } else if (answer) {
        updated = (await ingestContact({ botId: bot.id, externalId, city: answer })).contact;
        closed.add("city");
      }
    }
  }

  const step = problem ? (currentStep as SurveyStep) : nextStep(updated, closed);

  const parts: string[] = [];
  if (!answering && !currentStep) parts.push(GREETING);
  if (problem) parts.push(problem);
  if (step === "done") {
    if (currentStep !== "done") parts.push(THANKS);
  } else {
    parts.push(QUESTIONS[step]);
  }

  const reply = parts.join("\n\n");
  const stateValue = `${step}|${[...closed].join(",")}`;

  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data: { surveyStep: stateValue },
  });

  if (reply) {
    const result = await sendMessage(bot, externalId, reply, {
      requestContact: step === "phone" && bot.platform === "TELEGRAM",
    });
    if (result.ok) {
      await logMessage({
        botId: bot.id,
        subscriberId: subscriber.id,
        contactId: updated.id,
        direction: "OUT",
        text: reply,
      });
    }
  }

  return { contact: updated, subscriber };
}
