"use client";

import { useState } from "react";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--bg)] px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-xs hover:border-[var(--accent)]"
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}
