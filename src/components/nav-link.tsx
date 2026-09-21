"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useInboxEvents } from "@/components/use-inbox-events";
import { isSoundOn, playNotification, unlockSoundOnFirstGesture } from "@/lib/notification-sound";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--ink)] hover:bg-[var(--bg)]"
      }`}
    >
      {children}
    </Link>
  );
}

/** Пункт «Входящие» со счётчиком непрочитанных — приходит потоком с сервера. */
export function InboxNavLink() {
  const pathname = usePathname();
  const active = pathname.startsWith("/inbox");
  const [unread, setUnread] = useState(0);

  // Браузер не даст звучать до первого действия пользователя — снимаем блокировку заранее.
  useEffect(() => unlockSoundOnFirstGesture(), []);

  useInboxEvents((event) => {
    setUnread(event.unread);
    if (event.type === "incoming" && isSoundOn()) playNotification();
  });

  return (
    <Link
      href="/inbox"
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-[var(--accent)] text-white" : "text-[var(--ink)] hover:bg-[var(--bg)]"
      }`}
    >
      Входящие
      {unread > 0 ? (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
            active ? "bg-white text-[var(--accent)]" : "bg-[var(--accent)] text-white"
          }`}
        >
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
