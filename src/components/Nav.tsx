"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/calendar", label: "Calendar" },
  { href: "/posts", label: "Posts" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ name }: { name: string }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 z-20 flex items-center gap-4 bg-ink px-4 py-3 text-white lg:h-screen lg:w-60 lg:flex-col lg:items-stretch lg:gap-0 lg:px-4 lg:py-6">
      <Link href="/dashboard" className="font-display text-lg font-semibold lg:mb-8 lg:px-3">PostPilot</Link>
      <Link href="/compose" className="btn-primary shrink-0 lg:mb-6">New post</Link>
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {LINKS.map((l) => {
          const active = path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm ${active ? "bg-white/12 font-semibold text-white" : "text-white/65 hover:bg-white/6 hover:text-white"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <form action="/api/auth/logout" method="post" className="ml-auto hidden lg:mt-auto lg:ml-0 lg:block">
        <p className="truncate px-3 text-sm text-white/60">{name}</p>
        <button className="px-3 py-1 text-sm text-white/60 underline hover:text-white">Sign out</button>
      </form>
    </aside>
  );
}
