"use client";

import { useSyncExternalStore } from "react";
import {
  isSoundOn,
  playNotification,
  setSoundOn,
  subscribeSound,
} from "@/lib/notification-sound";

/** Включение звука уведомлений. Нажатие заодно «будит» звук в браузере. */
export function SoundToggle() {
  const soundOn = useSyncExternalStore(
    subscribeSound,
    () => isSoundOn(),
    () => true,
  );

  return (
    <button
      type="button"
      onClick={() => {
        const next = !soundOn;
        setSoundOn(next);
        if (next) playNotification();
      }}
      title={soundOn ? "Выключить звук уведомлений" : "Включить звук уведомлений"}
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--bg)]"
    >
      {soundOn ? "🔔 Звук включён" : "🔕 Звук выключен"}
    </button>
  );
}
