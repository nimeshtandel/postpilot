import Link from "next/link";
import { postsInRange } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { PageHeader, PlatformDot } from "@/components/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** YYYY-MM-DD of a moment in the given timezone. */
const localDay = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
const localTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const tz = user.timezone;
  const today = localDay(new Date(), tz);
  const { month } = await searchParams;
  const [y, m] = (/^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.slice(0, 7)).split("-").map(Number);

  // Calendar arithmetic on UTC-midnight dates (pure Y-M-D, no timezone drift).
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // back to Monday
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  });
  const lastRowNeeded = days.slice(35).some((d) => d.getUTCMonth() === m - 1);
  const visible = lastRowNeeded ? days : days.slice(0, 35);

  const rangeStart = new Date(visible[0].getTime() - 864e5);
  const rangeEnd = new Date(visible[visible.length - 1].getTime() + 2 * 864e5);
  const posts = await postsInRange(user.id, rangeStart, rangeEnd);

  const byDay = new Map<string, typeof posts>();
  for (const p of posts) {
    const when = p.publishedAt ?? p.scheduledAt!;
    const key = localDay(when, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const title = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <>
      <PageHeader title={title}>
        <div className="flex gap-2">
          <Link href={`/calendar?month=${prev}`} className="btn-ghost" aria-label="Previous month">Previous</Link>
          <Link href="/calendar" className="btn-ghost">Today</Link>
          <Link href={`/calendar?month=${next}`} className="btn-ghost" aria-label="Next month">Next</Link>
        </div>
      </PageHeader>

      <div className="overflow-x-auto">
        <div className="panel min-w-[720px] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-base/60 text-sm text-muted">
            {WEEKDAYS.map((d) => <div key={d} className="px-3 py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {visible.map((d, i) => {
              const key = ymd(d);
              const inMonth = d.getUTCMonth() === m - 1;
              const isToday = key === today;
              const isPast = key < today;
              const items = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`group relative min-h-28 border-line p-2 ${i % 7 !== 6 ? "border-r" : ""} ${i < visible.length - 7 ? "border-b" : ""} ${inMonth ? "" : "bg-base/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${isToday ? "bg-accent font-semibold text-white" : inMonth ? "" : "text-muted"}`}
                    >
                      {d.getUTCDate()}
                    </span>
                    {!isPast && (
                      <Link
                        href={`/compose?date=${key}`}
                        className="rounded px-1.5 text-sm text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-base hover:text-ink"
                        aria-label={`New post on ${key}`}
                      >
                        +
                      </Link>
                    )}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {items.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <Link
                          href={["draft", "scheduled", "failed"].includes(p.status) ? `/compose?id=${p.id}` : "/posts?status=published"}
                          className={`block rounded-md border px-1.5 py-1 text-xs hover:border-ink ${p.status === "failed" ? "border-bad/40 bg-bad/5" : p.status === "draft" ? "border-dashed border-line" : "border-line bg-surface"}`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="font-semibold">{localTime(p.publishedAt ?? p.scheduledAt!, tz)}</span>
                            <span className="ml-auto flex -space-x-0.5">
                              {p.targets.map((t, j) => <PlatformDot key={j} platform={t.account.platform} size={7} />)}
                            </span>
                          </span>
                          <span className="line-clamp-1 text-muted">{p.content || "No caption"}</span>
                        </Link>
                      </li>
                    ))}
                    {items.length > 3 && <li className="px-1.5 text-xs text-muted">{items.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">Times shown in {tz}. Dashed outline means draft.</p>
    </>
  );
}
