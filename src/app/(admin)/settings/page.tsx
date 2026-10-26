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
  const geminiFromEnv = !geminiKey && Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-sm text-[var(--muted)]">Ключи внешних сервисов</p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">AI-помощник в сценариях и AI-ответы ботов</h2>
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
          . Если заданы оба, помощник использует Claude; AI-ответы ботов людям всегда идут через
          Gemini (включаются в карточке бота). Ключи хранятся в базе админки; ключ Gemini можно
          также задать переменной <code className="font-mono">GEMINI_API_KEY</code> в .env.
        </p>
        <SettingsForm
          masked={mask(key)}
          geminiMasked={geminiFromEnv ? "задан через GEMINI_API_KEY в .env" : mask(geminiKey)}
          geminiFromEnv={geminiFromEnv}
        />
      </section>
    </div>
  );
}
