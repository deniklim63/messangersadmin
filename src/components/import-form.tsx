"use client";

import Link from "next/link";
import { useState } from "react";
import {
  decodeBuffer,
  guessDelimiter,
  guessMapping,
  parseCsv,
  type FieldKey,
} from "@/lib/csv";
import type { ImportResult } from "@/lib/import";

const BATCH_SIZE = 300;

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "externalId", label: "ID в мессенджере", required: true },
  { key: "name", label: "Имя" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "E-mail" },
  { key: "city", label: "Город" },
  { key: "subscribedAt", label: "Дата подписки" },
];

const controlClass =
  "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

type Bot = { id: string; title: string; platform: "TELEGRAM" | "VK" };

export function ImportForm({ bots }: { bots: Bot[] }) {
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [encoding, setEncoding] = useState<"auto" | "utf-8" | "windows-1251">("auto");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    setResult(null);
    setError(null);
    setProgress(null);
    if (!file) {
      setHeaders([]);
      setRows([]);
      return;
    }

    const buffer = await file.arrayBuffer();
    const { text, used } = decodeBuffer(buffer, encoding);
    const delimiter = guessDelimiter(text);
    const parsed = parseCsv(text, delimiter);

    if (parsed.length < 2) {
      setError("В файле не нашлось строк с данными");
      return;
    }

    const [head, ...body] = parsed;
    setHeaders(head);
    setRows(body);
    setMapping(guessMapping(head));
    setFileInfo(
      `${file.name} · ${body.length} строк · кодировка ${used} · разделитель «${
        delimiter === "\t" ? "таб" : delimiter
      }»`,
    );
  }

  async function runImport() {
    const externalIdIndex = mapping.externalId;
    if (externalIdIndex === undefined) {
      setError("Укажите, в какой колонке лежит ID пользователя в мессенджере");
      return;
    }
    if (!botId) {
      setError("Выберите бота");
      return;
    }

    setError(null);
    setResult(null);
    setProgress(0);

    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    const pick = (row: string[], key: FieldKey) => {
      const index = mapping[key];
      return index === undefined ? null : (row[index]?.trim() ?? null);
    };

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE).map((row) => ({
        externalId: row[externalIdIndex]?.trim() ?? "",
        name: pick(row, "name"),
        phone: pick(row, "phone"),
        email: pick(row, "email"),
        city: pick(row, "city"),
        subscribedAt: pick(row, "subscribedAt"),
      }));

      try {
        const response = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ botId, rows: batch }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? `Сервер ответил ${response.status}`);
          setProgress(null);
          return;
        }
        const part = (await response.json()) as ImportResult;
        total.created += part.created;
        total.updated += part.updated;
        total.skipped += part.skipped;
        total.errors.push(...part.errors);
      } catch (caught) {
        setError((caught as Error).message);
        setProgress(null);
        return;
      }

      setProgress(Math.min(100, Math.round(((start + BATCH_SIZE) / rows.length) * 100)));
    }

    setProgress(100);
    setResult(total);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          В какого бота грузим
          <select
            value={botId}
            onChange={(event) => setBotId(event.target.value)}
            className={`mt-1 w-full ${controlClass}`}
          >
            {bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {bot.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Кодировка файла
          <select
            value={encoding}
            onChange={(event) =>
              setEncoding(event.target.value as "auto" | "utf-8" | "windows-1251")
            }
            className={`mt-1 w-full ${controlClass}`}
          >
            <option value="auto">Определить самому</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1251">Windows-1251</option>
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium">
        Файл выгрузки (CSV)
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-white file:px-3 file:py-2 file:text-sm"
        />
      </label>

      {fileInfo ? <p className="text-xs text-[var(--muted)]">{fileInfo}</p> : null}

      {headers.length > 0 ? (
        <>
          <div>
            <h3 className="text-sm font-medium">Какая колонка что означает</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <label key={field.key} className="block text-sm">
                  {field.label}
                  {field.required ? <span className="text-red-600"> *</span> : null}
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]:
                          event.target.value === "" ? undefined : Number(event.target.value),
                      }))
                    }
                    className={`mt-1 w-full ${controlClass}`}
                  >
                    <option value="">— не переносить —</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `колонка ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium">Как это ляжет в базу</h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                  <tr>
                    {FIELDS.map((field) => (
                      <th key={field.key} className="px-3 py-2 font-medium">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {FIELDS.map((field) => {
                        const index = mapping[field.key];
                        return (
                          <td key={field.key} className="px-3 py-2">
                            {index === undefined ? "—" : row[index] || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {progress !== null ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {result ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-4 text-sm">
          Добавлено: <b>{result.created}</b> · обновлено: <b>{result.updated}</b> · пропущено:{" "}
          <b>{result.skipped}</b>
          {result.errors.length ? (
            <div className="mt-2 text-red-700">
              Ошибок: {result.errors.length}. Первая: {result.errors[0].reason}
            </div>
          ) : null}
          <div className="mt-2">
            <Link href="/contacts" className="text-[var(--accent)]">
              Открыть пользователей
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void runImport()}
        disabled={rows.length === 0 || progress !== null}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {progress !== null && progress < 100
          ? `Импортирую… ${progress}%`
          : `Импортировать${rows.length ? ` (${rows.length})` : ""}`}
      </button>
    </div>
  );
}
