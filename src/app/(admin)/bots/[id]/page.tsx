import Link from "next/link";
import { notFound } from "next/navigation";
import { BotSettingsForm, TelegramWebhookButtons, VkConnectButton } from "@/components/bot-settings-form";
import { CopyField } from "@/components/copy-field";
import { SendTestForm } from "@/components/send-message-form";
import { deleteBot } from "@/lib/actions-bots";
import { prisma } from "@/lib/db";
import { getTelegramWebhookInfo, getVkTokenPermissions } from "@/lib/platforms";
import { webhookUrl } from "@/lib/webhook-url";

export const dynamic = "force-dynamic";

export default async function BotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bot = await prisma.bot.findUnique({
    where: { id },
    include: {
      _count: { select: { subscribers: true } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!bot) notFound();

  const url = webhookUrl(bot.id, bot.platform);
  const info =
    bot.platform === "TELEGRAM" && bot.token ? await getTelegramWebhookInfo(bot.token) : null;
  const connected = info?.url === url;
  const vkPermissions =
    bot.platform === "VK" && bot.token ? await getVkTokenPermissions(bot.token) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/bots" className="text-sm text-[var(--muted)] hover:underline">
            ← Ко всем ботам
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{bot.title}</h1>
          <p className="text-sm text-[var(--muted)]">
            {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"}
            {bot.username ? ` · @${bot.username}` : ""} · {bot._count.subscribers} чел.
          </p>
        </div>
        <form action={deleteBot}>
          <input type="hidden" name="id" value={bot.id} />
          <button
            type="submit"
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-red-600 hover:border-red-300"
          >
            Удалить бота
          </button>
        </form>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Подключение</h2>

        <div className="mt-4 space-y-3">
          <CopyField label="Адрес для webhook" value={url} />

          {bot.platform === "TELEGRAM" ? (
            <>
              <CopyField label="Секрет (X-Telegram-Bot-Api-Secret-Token)" value={bot.webhookSecret} />
              <p className="text-sm text-[var(--muted)]">
                Нажмите кнопку — админка сама пропишет адрес в Telegram. Нужен публичный
                https-адрес: задайте <code className="font-mono">APP_URL</code> в .env
                (для локальной отладки подойдёт ngrok).
              </p>
              <TelegramWebhookButtons botId={bot.id} />
              <div className="rounded-lg bg-[var(--bg)] p-3 text-sm">
                {!bot.token
                  ? "Токен не задан"
                  : info?.error
                    ? `Telegram ответил ошибкой: ${info.error}`
                    : connected
                      ? `Подключено${info?.lastErrorMessage ? ` · последняя ошибка: ${info.lastErrorMessage}` : ""}`
                      : info?.url
                        ? `Сейчас webhook ведёт на другой адрес: ${info.url}`
                        : "Webhook не подключён"}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                Нажмите кнопку — админка сама найдёт сообщество по ключу, пропишет адрес
                в Callback API, подтвердит его и включит события. Вручную ничего искать не нужно.
              </p>
              <VkConnectButton botId={bot.id} />
              {vkPermissions && !vkPermissions.includes("photos") ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  У ключа нет права «Фотографии» — картинки в рассылках и сценариях не
                  уйдут. Создайте новый ключ (Управление → Дополнительно → Работа с API →
                  Ключи доступа), отметив «Фотографии», и вставьте его в настройках ниже.
                </div>
              ) : null}
              <div className="rounded-lg bg-[var(--bg)] p-3 text-sm">
                {!bot.token
                  ? "Ключ доступа не задан — добавьте его в настройках ниже"
                  : bot.vkGroupId
                    ? `Сообщество ${bot.vkGroupId} подключено${
                        bot.vkConfirmation ? "" : " (строка подтверждения не получена)"
                      }`
                    : "Сообщество ещё не подключено"}
              </div>
              <details className="text-sm text-[var(--muted)]">
                <summary className="cursor-pointer">Где взять ключ доступа</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Сообщество → Управление → Сообщения: включите сообщения сообщества, а в
                    «Настройки для бота» — возможности ботов. Пока сообщения выключены, бот
                    работать не будет.
                  </li>
                  <li>
                    Управление → <b>Дополнительно</b> → Работа с API → вкладка «Ключи доступа».
                    Раздел спрятан именно внутри «Дополнительно» — отдельного пункта в меню нет.
                  </li>
                  <li>
                    «Создать ключ» и отметьте: сообщения сообщества, управление сообществом,
                    фотографии. Без права на управление админка не сможет прописать адрес сама,
                    без фотографий не отправит картинки из сценария.
                  </li>
                  <li>Скопируйте ключ, вставьте его в настройках ниже и сохраните.</li>
                  <li>Вернитесь сюда и нажмите «Подключить автоматически».</li>
                </ol>
                <p className="mt-2">
                  Id сообщества искать не нужно — админка определит его по ключу. Если ключ создан
                  без права на управление, ВКонтакте ответит ошибкой доступа: создайте ключ заново
                  с нужной галочкой.
                </p>
              </details>
            </>
          )}

          <CopyField label="Токен для внешних источников (Bearer)" value={bot.ingestToken} />
          <details className="text-sm text-[var(--muted)]">
            <summary className="cursor-pointer">Как слать данные из своего кода</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--bg)] p-3 font-mono text-xs">
{`curl -X POST ${url.replace(/\/api\/webhooks\/.*/, "/api/ingest")} \\
  -H "Authorization: Bearer ${bot.ingestToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"123","name":"Иван","phone":"+79991234567","email":"i@mail.ru","city":"Казань"}'`}
            </pre>
          </details>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Проверка</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Отправьте себе сообщение, чтобы убедиться, что токен рабочий.
        </p>
        <SendTestForm botId={bot.id} platform={bot.platform} />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Настройки</h2>
        <div className="mt-4">
          <BotSettingsForm bot={bot} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Последние события</h2>
        {bot.events.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Пока ничего не приходило. Здесь видно каждый запрос от платформы — удобно проверять
            подключение.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bot.events.map((event) => (
              <li key={event.id} className="rounded-lg bg-[var(--bg)] p-3 text-xs">
                <div className="flex justify-between text-[var(--muted)]">
                  <span>{event.source}</span>
                  <span>{event.createdAt.toLocaleString("ru-RU")}</span>
                </div>
                {event.error ? <div className="mt-1 text-red-600">{event.error}</div> : null}
                <pre className="mt-1 max-h-32 overflow-auto font-mono">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
