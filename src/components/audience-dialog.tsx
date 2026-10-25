"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { blockAudience, type AudienceRow } from "@/lib/actions-scenarios";

export type AudienceQuery = {
  blockId: string;
  buttonId?: string | null;
  kind: "sent" | "error" | "click";
  title: string;
};

const KIND_LABEL = { sent: "Получили", error: "Не доставлено", click: "Нажали" } as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AudienceDialog({ query, onClose }: { query: AudienceQuery; onClose: () => void }) {
  const [rows, setRows] = useState<AudienceRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    blockAudience({ blockId: query.blockId, buttonId: query.buttonId, kind: query.kind }).then(
      (result) => {
        if (!alive) return;
        setRows(result.rows);
        setTotal(result.total);
      },
    );
    return () => {
      alive = false;
    };
  }, [query.blockId, query.buttonId, query.kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = filter.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (row) =>
      !needle ||
      [row.name, row.username, row.email, row.phone, row.externalId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
  );

  function exportCsv() {
    const header = ["Имя", "Ник", "Email", "Телефон", "ID", "Когда", "Ошибка"];
    const lines = visible.map((row) =>
      [row.name, row.username ? `@${row.username}` : "", row.email, row.phone, row.externalId, when(row.at), row.error]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["\ufeff" + [header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${query.title}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {KIND_LABEL[query.kind]}
            </div>
            <h2 className="truncate text-lg font-semibold">{query.title}</h2>
            <div className="text-sm text-[var(--muted)]">
              {rows ? `${total} чел.` : "Загружаю…"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Поиск"
              className="w-44 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={!rows?.length}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              ⇩ CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--muted)]">Пока никого</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg)] text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-2 font-medium">Имя</th>
                  <th className="px-3 py-2 font-medium">Ник</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Телефон</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Когда</th>
                  {query.kind === "error" ? <th className="px-3 py-2 font-medium">Ошибка</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visible.map((row) => (
                  <tr key={row.subscriberId} className="hover:bg-[var(--bg)]">
                    <td className="px-5 py-2">
                      {row.contactId ? (
                        <Link href={`/contacts/${row.contactId}`} className="font-medium text-[var(--accent)] hover:underline">
                          {row.name ?? "Без имени"}
                        </Link>
                      ) : (
                        row.name ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{row.username ? `@${row.username}` : "—"}</td>
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{row.externalId}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[var(--muted)]">{when(row.at)}</td>
                    {query.kind === "error" ? (
                      <td className="px-3 py-2 text-red-700">{row.error ?? "—"}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
