"use client";

import { useActionState, useState } from "react";
import { updateBotAi, type BotAiState } from "@/lib/actions-bots";

type Bot = {
  id: string;
  aiEnabled: boolean;
  aiModel: string | null;
  aiPrompt: string | null;
  aiKnowledge: string | null;
  aiHandoff: boolean;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

/** Настройки AI-ответов бота: включение, модель, тон, база знаний и пробный вопрос. */
export function BotAiForm({
  bot,
  models,
  defaultModel,
  defaults,
  hasKey,
}: {
  bot: Bot;
  models: { id: string; label: string }[];
  defaultModel: string;
  /** Тексты из home/tov.md и home/knowledge.md — работают, пока поля пустые. */
  defaults: { tov: string; knowledge: string };
  hasKey: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBotAi, {} as BotAiState);
  // Поля управляемые: после server action React сбрасывает форму, а правки тона
  // и базы знаний при нажатии «Проверить» терять нельзя.
  const [enabled, setEnabled] = useState(bot.aiEnabled);
  const [handoff, setHandoff] = useState(bot.aiHandoff);
  const [model, setModel] = useState(bot.aiModel ?? defaultModel);
  const [prompt, setPrompt] = useState(bot.aiPrompt ?? "");
  const [knowledge, setKnowledge] = useState(bot.aiKnowledge ?? "");
  const [question, setQuestion] = useState("");
  // Пробный диалог: история живёт в браузере и уходит на сервер с каждым вопросом,
  // чтобы можно было проверить игры и многоходовые разговоры.
  const [turns, setTurns] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [lastTest, setLastTest] = useState<BotAiState["test"] | null>(null);

  // Новый ответ сервера дописываем в диалог прямо при рендере — так React
  // советует хранить «предыдущее значение» без эффекта.
  if (state.test && state.test.at !== lastTest?.at) {
    setLastTest(state.test);
    setTurns([
      ...turns,
      { role: "user", text: state.test.question },
      { role: "model", text: state.test.reply },
    ]);
    setQuestion("");
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={bot.id} />

      {!hasKey ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Ключ Gemini не задан — добавьте его в разделе «Настройки», иначе AI отвечать не сможет.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aiEnabled"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Отвечать на вопросы с помощью AI
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aiHandoff"
            checked={handoff}
            onChange={(event) => setHandoff(event.target.checked)}
          />
          Передавать оператору, если AI не может помочь
        </label>
      </div>
      <p className="text-xs text-[var(--muted)]">
        AI отвечает только на свободный текст, который не понял сценарий: кнопки, ключевые слова
        и вопросы сценария работают как раньше. Пока диалог у оператора, AI молчит.
        Все ответы AI видны во «Входящих» с пометкой 🤖.
      </p>

      <label className="block text-sm font-medium sm:max-w-md">
        Модель
        <select
          name="aiModel"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className={inputClass}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Характер и тон (tone of voice)
        <textarea
          name="aiPrompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={8}
          placeholder="Пусто — используется home/tov.md из репозитория"
          className={`${inputClass} font-mono text-xs`}
        />
      </label>
      {!prompt.trim() ? (
        <details className="text-sm text-[var(--muted)]">
          <summary className="cursor-pointer">Сейчас действует home/tov.md</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-3 font-mono text-xs">
            {defaults.tov || "Файл home/tov.md не найден"}
          </pre>
        </details>
      ) : null}

      <label className="block text-sm font-medium">
        База знаний
        <textarea
          name="aiKnowledge"
          value={knowledge}
          onChange={(event) => setKnowledge(event.target.value)}
          rows={8}
          placeholder="Пусто — используется home/knowledge.md из репозитория"
          className={`${inputClass} font-mono text-xs`}
        />
      </label>
      {!knowledge.trim() ? (
        <details className="text-sm text-[var(--muted)]">
          <summary className="cursor-pointer">Сейчас действует home/knowledge.md</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-3 font-mono text-xs">
            {defaults.knowledge || "Файл home/knowledge.md не найден"}
          </pre>
        </details>
      ) : null}

      <div className="rounded-lg bg-[var(--bg)] p-3">
        <input type="hidden" name="history" value={JSON.stringify(turns)} />
        {turns.length > 0 ? (
          <div className="mb-3 space-y-2">
            {turns.map((turn, index) => (
              <div
                key={index}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  turn.role === "user" ? "ml-auto bg-blue-50 text-blue-900" : "bg-white"
                }`}
              >
                {turn.text}
              </div>
            ))}
            {lastTest ? (
              <div className="text-xs text-[var(--muted)]">
                {lastTest.model}
                {lastTest.handoff ? " · передал бы диалог оператору" : ""}
              </div>
            ) : null}
          </div>
        ) : null}
        <label className="block text-sm font-medium">
          {turns.length > 0 ? "Продолжить пробный диалог" : "Проверить: задайте вопрос как пользователь"}
          <input
            name="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Как поставить подписку на паузу?"
            className={`${inputClass} bg-white`}
          />
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Ответ покажется здесь и никуда не отправится. Проверяются значения формы, даже
          несохранённые. Диалог накапливается — так можно проверить игры и уточняющие вопросы.
          {turns.length > 0 ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setLastTest(null);
                }}
                className="underline"
              >
                Начать заново
              </button>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Подождите…" : "Сохранить"}
        </button>
        <button
          type="submit"
          name="intent"
          value="test"
          disabled={pending || !hasKey}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
        >
          Проверить ответ
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}
