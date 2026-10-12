import { PLATFORM_INFO, type Platform } from "@/lib/platforms";

export function PlatformDot({ platform, size = 10 }: { platform: string; size?: number }) {
  const info = PLATFORM_INFO[platform as Platform];
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10"
      style={{ width: size, height: size, background: info?.color ?? "#999" }}
      aria-hidden
    />
  );
}

export function PlatformChip({ platform }: { platform: string }) {
  const info = PLATFORM_INFO[platform as Platform];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium">
      <PlatformDot platform={platform} size={8} />
      {info?.name ?? platform}
    </span>
  );
}

export function Avatar({ src, name, platform }: { src?: string | null; name: string; platform: string }) {
  return (
    <span className="relative inline-block h-9 w-9 shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-base text-sm font-semibold text-ink-soft">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-surface p-0.5">
        <PlatformDot platform={platform} size={10} />
      </span>
    </span>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-base text-muted" },
  scheduled: { label: "Scheduled", cls: "bg-ink/8 text-ink" },
  publishing: { label: "Publishing", cls: "bg-warn/12 text-warn" },
  published: { label: "Published", cls: "bg-ok/12 text-ok" },
  partial: { label: "Partly published", cls: "bg-warn/12 text-warn" },
  failed: { label: "Failed", cls: "bg-bad/10 text-bad" },
  pending: { label: "Waiting", cls: "bg-base text-muted" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-base text-muted" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

export function fmtDate(d: Date, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  }).format(d);
}
