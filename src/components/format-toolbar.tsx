"use client";

import type { RefObject } from "react";

const BUTTONS = [
  { tag: "b", label: "Ж", title: "Жирный", className: "font-bold" },
  { tag: "i", label: "К", title: "Курсив", className: "italic" },
  { tag: "u", label: "П", title: "Подчёркнутый", className: "underline" },
  { tag: "s", label: "З", title: "Зачёркнутый", className: "line-through" },
] as const;

/**
 * Кнопки оформления для поля ввода: оборачивают выделенный текст в теги.
 * Разметка та же, что в рассылках — Telegram получит оформление, ВКонтакте чистый текст.
 */
export function FormatToolbar({
  textareaRef,
  value,
  onChange,
  compact = false,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  function wrap(open: string, close: string) {
    const field = textareaRef.current;
    if (!field) return;
    const { selectionStart, selectionEnd } = field;
    const selected = value.slice(selectionStart, selectionEnd);
    onChange(value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(selectionStart + open.length, selectionEnd + open.length);
    });
  }

  const size = compact ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm";

  return (
    <div className="flex flex-wrap gap-1">
      {BUTTONS.map((button) => (
        <button
          key={button.tag}
          type="button"
          title={button.title}
          onClick={() => wrap(`<${button.tag}>`, `</${button.tag}>`)}
          className={`${size} rounded-lg border border-[var(--line)] bg-white hover:border-[var(--accent)] ${button.className}`}
        >
          {button.label}
        </button>
      ))}
      <button
        type="button"
        title="Ссылка"
        onClick={() => {
          const url = window.prompt("Адрес ссылки", "https://");
          if (url) wrap(`<a href="${url}">`, "</a>");
        }}
        className={`${compact ? "h-7 text-xs" : "h-8 text-sm"} rounded-lg border border-[var(--line)] bg-white px-2 hover:border-[var(--accent)]`}
      >
        Ссылка
      </button>
    </div>
  );
}
