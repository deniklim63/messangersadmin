"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { askAssistant } from "@/lib/actions-ai";

type Turn = { role: "user" | "assistant"; text: string; applied?: string[] };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

function createRecognition(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function ScenarioAssistant({
  scenarioId,
  enabled,
}: {
  scenarioId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = createRecognition();
    if (!recognition) {
      setError("Диктовка работает в Chrome и Safari — здесь распознавание речи недоступно");
      return;
    }
    recognition.lang = "ru-RU";
    recognition.interimResults = true;
    recognition.continuous = true;
    const base = text ? `${text.trim()} ` : "";
    recognition.onresult = (event) => {
      const spoken = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      setText(base + spoken);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    recognitionRef.current?.stop();
    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.set("scenarioId", scenarioId);
    formData.set("message", message);
    formData.set("history", JSON.stringify(turns.map(({ role, text }) => ({ role, text }))));
    for (const file of files) formData.append("files", file);

    setTurns((list) => [...list, { role: "user", text: message }]);
    setText("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";

    const result = await askAssistant(formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTurns((list) => [...list, { role: "assistant", text: result.reply, applied: result.applied }]);
    if (result.applied.length) router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <div className="text-sm font-semibold">AI-помощник</div>
        <div className="text-xs text-[var(--muted)]">
          Расскажите или надиктуйте, что должен делать бот, — помощник соберёт экраны сам
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {!enabled ? (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
            Помощник выключен: задайте ключ Anthropic или Gemini в разделе «Настройки».
          </p>
        ) : null}
        {turns.length === 0 && enabled ? (
          <p className="text-[var(--muted)]">
            Например: «Сделай рассылку про игру в пятницу: первое сообщение с афишей и
            кнопками “Записаться” (ссылка на сайт) и “Напомнить позже”, во втором случае
            через день напомни ещё раз».
          </p>
        ) : null}
        {turns.map((turn, index) => (
          <div
            key={index}
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 ${
              turn.role === "user"
                ? "ml-6 rounded-tr-sm bg-[var(--accent)]/10"
                : "mr-6 rounded-tl-sm bg-[var(--bg)]"
            }`}
          >
            {turn.text}
            {turn.applied?.length ? (
              <ul className="mt-2 space-y-0.5 text-xs text-[var(--muted)]">
                {turn.applied.map((line, i) => (
                  <li key={i}>✓ {line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {busy ? <div className="text-[var(--muted)]">Думаю…</div> : null}
        {error ? <div className="text-red-600">{error}</div> : null}
      </div>

      <div className="border-t border-[var(--line)] p-3">
        {files.length ? (
          <div className="mb-2 flex flex-wrap gap-1 text-xs">
            {files.map((file) => (
              <span key={file.name} className="rounded-lg bg-[var(--bg)] px-2 py-1">
                📎 {file.name}
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
          rows={3}
          disabled={!enabled || busy}
          placeholder={listening ? "Слушаю…" : "Что должен делать бот?"}
          className="w-full resize-none rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!enabled || busy}
            title="Диктовать"
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              listening ? "border-red-300 bg-red-50 text-red-700" : "border-[var(--line)]"
            }`}
          >
            {listening ? "⏹ Стоп" : "🎤 Диктовать"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="hidden"
            id={`assistant-files-${scenarioId}`}
          />
          <label
            htmlFor={`assistant-files-${scenarioId}`}
            className="cursor-pointer rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
            title="Приложить картинки или документы"
          >
            📎 Файлы
          </label>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!enabled || busy || !text.trim()}
            className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Отправить
          </button>
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">⌘/Ctrl + Enter — отправить</div>
      </div>
    </div>
  );
}
