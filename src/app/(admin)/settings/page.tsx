import { SettingsForm } from "@/components/settings-form";
import { getSetting, SETTING_ANTHROPIC_KEY, SETTING_GEMINI_KEY } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [key, geminiKey] = await Promise.all([
    getSetting(SETTING_ANTHROPIC_KEY),
    getSetting(SETTING_GEMINI_KEY),
  ]);
  const mask = (value: string | null) =>
    value ? `задан, заканчивается на …${value.slice(-4)}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-sm text-[var(--muted)]">Ключи внешних сервисов</p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">AI-помощник в сценариях</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Нужен ключ одного из сервисов: Anthropic (Claude) — из{" "}
          <a
            href="https://platform.claude.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            консоли Anthropic
          </a>
          , или Google Gemini — из{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            Google AI Studio
          </a>
          . Если заданы оба, используется Claude. Ключи хранятся только в базе админки.
        </p>
        <SettingsForm masked={mask(key)} geminiMasked={mask(geminiKey)} />
      </section>
    </div>
  );
}
