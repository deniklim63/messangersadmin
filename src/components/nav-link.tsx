"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
