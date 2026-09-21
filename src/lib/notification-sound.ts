"use client";

const SOUND_KEY = "tg-admin-sound";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audioContext ??= new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // приватный режим — просто не запоминаем выбор
  }
  for (const listener of listeners) listener();
}

/** Подписка для useSyncExternalStore — чтобы кнопка и звук не разъезжались. */
export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Короткий двухнотный сигнал. Генерируем звук сами, чтобы не тащить файл
 * и не зависеть от загрузки.
 */
export function playNotification(): void {
  const context = getContext();
  if (!context) return;

  // Браузер разрешает звук только после действия пользователя.
  if (context.state === "suspended") void context.resume();

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  gain.connect(context.destination);

  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(1318, now + 0.1);
  oscillator.connect(gain);
  oscillator.start(now);
  oscillator.stop(now + 0.46);
}

/** Первый клик по странице «разбудит» звук — до него браузер его глушит. */
export function unlockSoundOnFirstGesture(): () => void {
  if (typeof window === "undefined") return () => {};

  const unlock = () => {
    const context = getContext();
    if (context?.state === "suspended") void context.resume();
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}
