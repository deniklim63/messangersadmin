import { SettingsForm } from "@/components/settings-form";
import { getSetting, SETTING_ANTHROPIC_KEY } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const key = await getSetting(SETTING_ANTHROPIC_KEY);
  const masked = key ? `задан, заканчивается на …${key.slice(-4)}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-sm text-[var(--muted)]">Ключи внешних сервисов</p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">AI-помощник в сценариях</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Помощник работает на Claude. Нужен ключ Anthropic API — создаётся в{" "}
          <a
            href="https://platform.claude.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            консоли Anthropic
          </a>
          . Ключ хранится только в базе админки.
        </p>
        <SettingsForm masked={masked} />
      </section>
    </div>
  );
}
