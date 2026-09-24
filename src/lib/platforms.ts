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

export type KeyboardButton = { label: string; url?: string | null; id?: string };

/**
 * Telegram: кнопки-ссылки бывают только в клавиатуре под сообщением,
 * поэтому при наличии ссылки весь блок кнопок отдаём инлайном.
 */
function telegramInlineKeyboard(buttons: KeyboardButton[]) {
  return {
    inline_keyboard: buttons.map((button) => [
      button.url
        ? { text: button.label, url: button.url }
        : { text: button.label, callback_data: (button.id ?? button.label).slice(0, 64) },
    ]),
  };
}

/** Кнопки сценария — обычная клавиатура под полем ввода, по одной в ряд. */
function telegramKeyboard(labels: string[]) {
  return {
    keyboard: labels.map((label) => [{ text: label }]),
    resize_keyboard: true,
  };
}

/** ВКонтакте ждёт клавиатуру строкой JSON и не больше 40 кнопок. */
function vkKeyboard(buttons: KeyboardButton[]): string {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: buttons.slice(0, 40).map((button) =>
      button.url
        ? [{ action: { type: "open_link", link: button.url, label: button.label.slice(0, 40) } }]
        : [{ action: { type: "text", label: button.label.slice(0, 40) }, color: "secondary" }],
    ),
  });
}

export async function sendTelegramMessage(
  bot: Pick<Bot, "token">,
  chatId: string,
  text: string,
  options: { requestContact?: boolean; html?: boolean; keyboard?: KeyboardButton[] } = {},
): Promise<SendResult> {
  if (!bot.token) return { ok: false, error: "У бота не задан токен" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options.html ? { parse_mode: "HTML", link_preview_options: { is_disabled: false } } : {}),
        reply_markup: options.requestContact
          ? TELEGRAM_CONTACT_KEYBOARD
          : options.keyboard?.length
            ? options.keyboard.some((button) => button.url)
              ? telegramInlineKeyboard(options.keyboard)
              : telegramKeyboard(options.keyboard.map((button) => button.label))
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
  options: { attachment?: string; keyboard?: KeyboardButton[] } = {},
): Promise<SendResult> {
  if (!bot.token) return { ok: false, error: "У сообщества не задан ключ доступа" };
  try {
    const params = new URLSearchParams({
      access_token: bot.token,
      v: VK_API_VERSION,
      user_id: userId,
      message: text,
      random_id: String(Date.now() + Math.floor(Math.random() * 1000)),
      ...(options.attachment ? { attachment: options.attachment } : {}),
      ...(options.keyboard?.length ? { keyboard: vkKeyboard(options.keyboard) } : {}),
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
  options: {
    requestContact?: boolean;
    html?: boolean;
    attachment?: string;
    keyboard?: KeyboardButton[];
  } = {},
): Promise<SendResult> {
  return bot.platform === "TELEGRAM"
    ? sendTelegramMessage(bot, externalId, text, options)
    : sendVkMessage(bot, externalId, text, {
        attachment: options.attachment,
        keyboard: options.keyboard,
      });
}

export type MediaKind = "photo" | "video" | "document";

export type MediaSource = {
  /** file_id, полученный от Telegram при первой отправке — дальше шлём по нему. */
  fileId?: string;
  bytes?: Buffer;
  filename?: string;
  mime?: string;
};

/**
 * Картинка или видео в Telegram. Первому получателю файл уходит целиком,
 * в ответе приходит file_id — остальным отправляем уже по нему, без перезаливки.
 */
export async function sendTelegramMedia(
  bot: Pick<Bot, "token">,
  chatId: string,
  kind: MediaKind,
  media: MediaSource,
  caption: string,
  options: { html?: boolean } = {},
): Promise<SendResult & { fileId?: string }> {
  if (!bot.token) return { ok: false, error: "У бота не задан токен" };
  const method = kind === "photo" ? "sendPhoto" : kind === "video" ? "sendVideo" : "sendDocument";

  try {
    let response: Response;

    if (media.fileId) {
      response = await fetch(`https://api.telegram.org/bot${bot.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          [kind]: media.fileId,
          caption: caption || undefined,
          ...(caption && options.html ? { parse_mode: "HTML" } : {}),
        }),
      });
    } else if (media.bytes) {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append(
        kind,
        new Blob([new Uint8Array(media.bytes)], { type: media.mime || "application/octet-stream" }),
        media.filename || (kind === "photo" ? "photo.jpg" : kind === "video" ? "video.mp4" : "file"),
      );
      if (caption) {
        form.append("caption", caption);
        if (options.html) form.append("parse_mode", "HTML");
      }
      response = await fetch(`https://api.telegram.org/bot${bot.token}/${method}`, {
        method: "POST",
        body: form,
      });
    } else {
      return { ok: false, error: "Файл не передан" };
    }

    const data = (await response.json()) as {
      ok: boolean;
      description?: string;
      result?: {
        photo?: { file_id: string }[];
        video?: { file_id: string };
        document?: { file_id: string };
      };
    };
    if (!data.ok) return { ok: false, error: data.description };

    const fileId =
      kind === "photo"
        ? data.result?.photo?.at(-1)?.file_id
        : kind === "video"
          ? data.result?.video?.file_id
          : data.result?.document?.file_id;

    return { ok: true, fileId: fileId ?? media.fileId };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Загружает картинку в ВК и возвращает строку вложения (photo<owner>_<id>).
 * Загрузка нужна одна на рассылку — вложение переиспользуется.
 */
export async function uploadVkPhoto(
  token: string,
  peerId: string,
  media: { bytes: Buffer; filename?: string; mime?: string },
): Promise<{ attachment?: string; error?: string }> {
  // Сервер загрузки ВК иногда отвечает пустым результатом без причины —
  // с новым адресом загрузки со второй попытки обычно проходит.
  let last: { attachment?: string; error?: string } = { error: "ВК не принял файл" };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    last = await uploadVkPhotoOnce(token, peerId, media);
    if (last.attachment) return last;
    if (/access denied|scopes|permission/i.test(last.error ?? "")) return last;
    await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
  }
  return last;
}

async function uploadVkPhotoOnce(
  token: string,
  peerId: string,
  media: { bytes: Buffer; filename?: string; mime?: string },
): Promise<{ attachment?: string; error?: string }> {
  try {
    const serverParams = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      peer_id: peerId,
    });
    const serverRes = await fetch(
      `https://api.vk.com/method/photos.getMessagesUploadServer?${serverParams}`,
    );
    const serverData = (await serverRes.json()) as {
      response?: { upload_url: string };
      error?: { error_msg: string };
    };
    if (!serverData.response) return { error: serverData.error?.error_msg ?? "ВК не дал адрес загрузки" };

    const form = new FormData();
    // Имя файла ВК не хранит, а длинные и «странные» имена его смущают — даём своё.
    const extension = (media.mime || "image/jpeg").includes("png") ? "png" : "jpg";
    form.append(
      "photo",
      new Blob([new Uint8Array(media.bytes)], { type: media.mime || "image/jpeg" }),
      `photo.${extension}`,
    );
    const uploadRes = await fetch(serverData.response.upload_url, { method: "POST", body: form });
    const uploadText = await uploadRes.text();
    let uploaded: { server?: number; photo?: string; hash?: string; error?: string } = {};
    try {
      uploaded = JSON.parse(uploadText);
    } catch {
      return { error: `ВК не принял файл (HTTP ${uploadRes.status}): ${uploadText.slice(0, 120)}` };
    }
    if (!uploaded.photo || uploaded.photo === "[]") {
      return {
        error: `ВК не принял файл: ${uploaded.error ?? uploadText.slice(0, 120) ?? "пустой ответ"}`,
      };
    }

    const saveParams = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      server: String(uploaded.server),
      photo: uploaded.photo,
      hash: String(uploaded.hash),
    });
    const saveRes = await fetch(`https://api.vk.com/method/photos.saveMessagesPhoto?${saveParams}`);
    const saved = (await saveRes.json()) as {
      response?: { id: number; owner_id: number }[];
      error?: { error_msg: string };
    };
    const photo = saved.response?.[0];
    if (!photo) return { error: saved.error?.error_msg ?? "ВК не сохранил файл" };

    return { attachment: `photo${photo.owner_id}_${photo.id}` };
  } catch (error) {
    return { error: (error as Error).message };
  }
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
        allowed_updates: ["message", "my_chat_member", "callback_query"],
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

/** Права ключа сообщества — чтобы заранее предупредить, что картинки не уйдут. */
export async function getVkTokenPermissions(token: string): Promise<string[] | null> {
  try {
    const params = new URLSearchParams({ access_token: token, v: VK_API_VERSION });
    const res = await fetch(`https://api.vk.com/method/groups.getTokenPermissions?${params}`);
    const data = (await res.json()) as { response?: { permissions?: { name: string }[] } };
    return data.response?.permissions?.map((item) => item.name) ?? null;
  } catch {
    return null;
  }
}

/** Понятное объяснение отказа ВК при загрузке картинки. */
export function explainVkUploadError(error: string): string {
  if (/access denied|scopes|permission/i.test(error)) {
    return (
      "у ключа сообщества нет права «Фотографии». Создайте новый ключ " +
      "(Управление → Дополнительно → Работа с API → Ключи доступа), отметив «Фотографии», " +
      "и вставьте его в настройках бота"
    );
  }
  return error;
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


/**
 * Картинка блока в Telegram: первый раз отправляем по ссылке на наш сервер,
 * дальше — по file_id, который вернул Telegram.
 */
export async function sendTelegramPhotoByRef(
  bot: Pick<Bot, "token">,
  chatId: string,
  photo: string,
  caption: string,
  options: { keyboard?: KeyboardButton[]; html?: boolean } = {},
): Promise<SendResult & { fileId?: string }> {
  if (!bot.token) return { ok: false, error: "У бота не задан токен" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${bot.token}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo,
        caption: caption ? caption.slice(0, 1024) : undefined,
        ...(caption && options.html ? { parse_mode: "HTML" } : {}),
        reply_markup: options.keyboard?.length
          ? options.keyboard.some((button) => button.url)
            ? telegramInlineKeyboard(options.keyboard)
            : telegramKeyboard(options.keyboard.map((button) => button.label))
          : TELEGRAM_REMOVE_KEYBOARD,
      }),
    });
    const data = (await response.json()) as {
      ok: boolean;
      description?: string;
      result?: { photo?: { file_id: string }[] };
    };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, fileId: data.result?.photo?.at(-1)?.file_id };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

type VkResponse<T> = { response?: T; error?: { error_msg: string; error_code: number } };

/** Понятные объяснения вместо кодов ВКонтакте. */
function explainVkError(code: number, message: string): string {
  switch (code) {
    case 5:
      return "Ключ доступа неверный или устарел — создайте новый в настройках сообщества";
    case 15:
      return "Ключ не даёт доступа к этому сообществу — проверьте, что создали его в нужном сообществе";
    case 27:
    case 28:
      return "Это ключ приложения, а не сообщества — создайте ключ доступа сообщества";
    case 100:
      return "ВКонтакте не принял параметры запроса: " + message;
    case 203:
      return "Нет доступа к сообществу — нужен ключ с правом «Управление сообществом»";
    case 2000:
      return "У сообщества уже максимум серверов Callback API — удалите лишний в настройках";
    default:
      return message;
  }
}

/** Общий вызов VK API — все параметры формой, как требует их сервер. */
async function vkApi<T>(
  method: string,
  token: string,
  params: Record<string, string | number>,
): Promise<{ data?: T; error?: string }> {
  try {
    const body = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    });

    const response = await fetch(`https://api.vk.com/method/${method}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await response.json()) as VkResponse<T>;
    if (data.error) {
      return { error: explainVkError(data.error.error_code, data.error.error_msg) };
    }
    return { data: data.response };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** По ключу доступа определяет, какому сообществу он принадлежит. */
export async function getVkGroupByToken(
  token: string,
): Promise<{ id?: string; name?: string; screenName?: string; error?: string }> {
  const result = await vkApi<{ id: number; name: string; screen_name: string }[]>(
    "groups.getById",
    token,
    {},
  );
  if (result.error) return { error: result.error };

  // Ключ сообщества возвращает своё сообщество; у новых версий ответ приходит в groups.
  const group = Array.isArray(result.data)
    ? result.data[0]
    : (result.data as unknown as { groups?: { id: number; name: string; screen_name: string }[] })
        ?.groups?.[0];

  if (!group) return { error: "ВКонтакте не вернул сообщество для этого ключа" };
  return { id: String(group.id), name: group.name, screenName: group.screen_name };
}

export type VkSetupResult = {
  ok: boolean;
  groupId?: string;
  groupName?: string;
  confirmation?: string;
  serverId?: number;
  error?: string;
};

/**
 * Полная настройка Callback API за пользователя: узнаём сообщество, берём строку
 * подтверждения, добавляем сервер и включаем нужные события.
 * Строку подтверждения нужно сохранить в боте до добавления сервера — ВКонтакте
 * сразу постучится к нам и будет ждать её в ответе.
 */
export async function setupVkCallback(params: {
  token: string;
  url: string;
  secret: string;
  title: string;
  onConfirmationReady: (groupId: string, confirmation: string) => Promise<void>;
}): Promise<VkSetupResult> {
  const group = await getVkGroupByToken(params.token);
  if (group.error || !group.id) return { ok: false, error: group.error };

  const code = await vkApi<{ code: string }>("groups.getCallbackConfirmationCode", params.token, {
    group_id: group.id,
  });
  if (code.error || !code.data?.code) {
    return {
      ok: false,
      error: code.error ?? "Не удалось получить строку подтверждения",
      groupId: group.id,
      groupName: group.name,
    };
  }

  await params.onConfirmationReady(group.id, code.data.code);

  const server = await vkApi<{ server_id: number }>("groups.addCallbackServer", params.token, {
    group_id: group.id,
    url: params.url,
    // ВКонтакте разрешает не больше 14 символов в названии сервера.
    title: params.title.slice(0, 14),
    secret_key: params.secret.slice(0, 50),
  });
  if (server.error || !server.data?.server_id) {
    return {
      ok: false,
      error: server.error ?? "ВКонтакте не принял адрес сервера",
      groupId: group.id,
      groupName: group.name,
      confirmation: code.data.code,
    };
  }

  const settings = await vkApi<number>("groups.setCallbackSettings", params.token, {
    group_id: group.id,
    server_id: server.data.server_id,
    api_version: VK_API_VERSION,
    message_new: 1,
    message_allow: 1,
    message_deny: 1,
  });
  if (settings.error) {
    return {
      ok: false,
      error: `Сервер добавлен, но события не включились: ${settings.error}`,
      groupId: group.id,
      groupName: group.name,
      confirmation: code.data.code,
      serverId: server.data.server_id,
    };
  }

  return {
    ok: true,
    groupId: group.id,
    groupName: group.name,
    confirmation: code.data.code,
    serverId: server.data.server_id,
  };
}


/** Гасит «часики» на инлайн-кнопке Telegram. */
export async function answerCallbackQuery(token: string, callbackId: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId }),
    });
  } catch {
    // не критично: кнопка всё равно сработает
  }
}


/** Загружает документ во ВКонтакте и возвращает строку вложения doc<owner>_<id>. */
export async function uploadVkDoc(
  token: string,
  peerId: string,
  media: { bytes: Buffer; filename: string; mime?: string },
): Promise<{ attachment?: string; error?: string }> {
  try {
    const serverParams = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      peer_id: peerId,
      type: "doc",
    });
    const serverRes = await fetch(
      `https://api.vk.com/method/docs.getMessagesUploadServer?${serverParams}`,
    );
    const serverData = (await serverRes.json()) as {
      response?: { upload_url: string };
      error?: { error_msg: string };
    };
    if (!serverData.response) return { error: serverData.error?.error_msg ?? "ВК не дал адрес загрузки" };

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(media.bytes)], { type: media.mime || "application/octet-stream" }),
      media.filename,
    );
    const uploadRes = await fetch(serverData.response.upload_url, { method: "POST", body: form });
    const uploaded = (await uploadRes.json()) as { file?: string };
    if (!uploaded.file) return { error: "ВК не принял файл" };

    const saveParams = new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      file: uploaded.file,
      title: media.filename,
    });
    const saveRes = await fetch(`https://api.vk.com/method/docs.save?${saveParams}`);
    const saved = (await saveRes.json()) as {
      response?: { type?: string; doc?: { id: number; owner_id: number } };
      error?: { error_msg: string };
    };
    const doc = saved.response?.doc;
    if (!doc) return { error: saved.error?.error_msg ?? "ВК не сохранил файл" };

    return { attachment: `doc${doc.owner_id}_${doc.id}` };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
