import type { Bot } from "@/generated/prisma/client";

const VK_API_VERSION = "5.199";

export type SendResult = { ok: boolean; error?: string };

/** Клавиатура Telegram с кнопкой «Поделиться телефоном». */
const TELEGRAM_CONTACT_KEYBOARD = {
  keyboard: [[{ text: "📱 Отправить мой номер", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const TELEGRAM_REMOVE_KEYBOARD = { remove_keyboard: true };

export async function sendTelegramMessage(
  bot: Pick<Bot, "token">,
  chatId: string,
  text: string,
  options: { requestContact?: boolean } = {},
): Promise<SendResult> {
  if (!bot.token) return { ok: false, error: "У бота не задан токен" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: options.requestContact
          ? TELEGRAM_CONTACT_KEYBOARD
          : TELEGRAM_REMOVE_KEYBOARD,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendVkMessage(
  bot: Pick<Bot, "token">,
  userId: string,
  text: string,
): Promise<SendResult> {
  if (!bot.token) return { ok: false, error: "У сообщества не задан ключ доступа" };
  try {
    const params = new URLSearchParams({
      access_token: bot.token,
      v: VK_API_VERSION,
      user_id: userId,
      message: text,
      random_id: String(Date.now() + Math.floor(Math.random() * 1000)),
    });
    const res = await fetch("https://api.vk.com/method/messages.send", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = (await res.json()) as { error?: { error_msg: string } };
    return data.error ? { ok: false, error: data.error.error_msg } : { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendMessage(
  bot: Pick<Bot, "token" | "platform">,
  externalId: string,
  text: string,
  options: { requestContact?: boolean } = {},
): Promise<SendResult> {
  return bot.platform === "TELEGRAM"
    ? sendTelegramMessage(bot, externalId, text, options)
    : sendVkMessage(bot, externalId, text);
}

/** Регистрирует webhook в Telegram — кнопка «Подключить» в карточке бота. */
export async function setTelegramWebhook(
  token: string,
  url: string,
  secretToken: string,
): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ["message", "my_chat_member"],
        drop_pending_updates: true,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function deleteTelegramWebhook(token: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Проверяет токен и возвращает @username бота. */
export async function getTelegramBotInfo(
  token: string,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    return data.ok
      ? { ok: true, username: data.result?.username }
      : { ok: false, error: data.description };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Подтягивает имя и город пользователя ВК по его id. */
export async function getVkUserInfo(
  token: string,
  userId: string,
): Promise<{ firstName?: string; lastName?: string; city?: string }> {
  try {
    const params = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      user_ids: userId,
      fields: "city",
    });
    const res = await fetch(`https://api.vk.com/method/users.get?${params}`);
    const data = (await res.json()) as {
      response?: { first_name?: string; last_name?: string; city?: { title?: string } }[];
    };
    const user = data.response?.[0];
    if (!user) return {};
    return { firstName: user.first_name, lastName: user.last_name, city: user.city?.title };
  } catch {
    return {};
  }
}

/** Текущее состояние webhook у бота — для строки статуса в карточке. */
export async function getTelegramWebhookInfo(token: string): Promise<{
  url?: string;
  pendingUpdateCount?: number;
  lastErrorMessage?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { url?: string; pending_update_count?: number; last_error_message?: string };
    };
    if (!data.ok) return { error: data.description };
    return {
      url: data.result?.url,
      pendingUpdateCount: data.result?.pending_update_count,
      lastErrorMessage: data.result?.last_error_message,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
