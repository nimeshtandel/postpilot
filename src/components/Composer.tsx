"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { PLATFORM_INFO, validateForPlatform, type Platform } from "@/lib/platforms";
import { Avatar, PlatformDot } from "./ui";

type Account = { id: string; platform: string; name: string; username: string | null; avatarUrl: string | null; status: string };
type MediaRef = { id: string; url: string; kind: "image" | "video"; mimeType: string };

export type ComposerInitial = {
  id: string;
  status: string;
  content: string;
  title: string;
  accountIds: string[];
  overrides: Record<string, string>;
  media: MediaRef[];
  scheduledAt: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Date → value for <input type="datetime-local"> in the browser's local time. */
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultWhen(initial?: ComposerInitial, date?: string) {
  if (initial?.scheduledAt && new Date(initial.scheduledAt) > new Date()) return toLocalInput(new Date(initial.scheduledAt));
  if (date) return `${date}T10:00`;
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toLocalInput(d);
}

const TONES = ["Friendly", "Professional", "Witty", "Inspiring", "Bold"];

export function Composer({ accounts, initial, defaultDate }: { accounts: Account[]; initial?: ComposerInitial; defaultDate?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial?.accountIds ?? []);
  const [content, setContent] = useState(initial?.content ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>(initial?.overrides ?? {});
  const [media, setMedia] = useState<MediaRef[]>(initial?.media ?? []);
  const [uploading, setUploading] = useState(0);
  const [when, setWhen] = useState(defaultWhen(initial, defaultDate));
  const [tab, setTab] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // AI
  const [aiOpen, setAiOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [aiBusy, setAiBusy] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);

  const selectedAccounts = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(selectedAccounts.map((a) => a.platform))] as Platform[];
  const textFor = (p: Platform) => overrides[p] ?? content;

  const problems = useMemo(
    () => platforms.flatMap((p) => validateForPlatform(p, textFor(p), media)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platforms.join(), content, overrides, media],
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await fetch("/api/media", { method: "POST", body: fd });
        const data = (await res.json()) as any;
        if (!res.ok) setError(`${file.name}: ${data.error}`);
        else setMedia((m) => [...m, data]);
      } catch {
        setError(`${file.name}: upload failed`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function runAi(mode: "write" | "adapt" | "improve") {
    const input = mode === "write" ? idea : content;
    if (!input.trim()) return setError(mode === "write" ? "Describe your idea first" : "Write a caption first");
    if (!platforms.length) return setError("Pick at least one account so the AI knows which platforms to write for");
    setAiBusy(true);
    setError("");
    const res = await fetch("/api/ai/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, input, tone, platforms }),
    });
    const data = (await res.json()) as any;
    setAiBusy(false);
    if (!res.ok) return setError(data.error ?? "AI request failed");
    const captions: Record<string, string> = data.captions;
    if (mode === "adapt") {
      setOverrides(captions);
    } else {
      // Use the longest-limit platform's caption as the main text; tailor the rest.
      const main = [...platforms].sort((a, b) => PLATFORM_INFO[b].charLimit - PLATFORM_INFO[a].charLimit)[0];
      setContent(captions[main] ?? "");
      const rest: Record<string, string> = {};
      for (const p of platforms) if (p !== main && captions[p] && captions[p] !== captions[main]) rest[p] = captions[p];
      setOverrides(rest);
    }
    setHashtags(data.hashtags ?? []);
    setTab("all");
  }

  async function submit(action: "draft" | "schedule" | "now") {
    setError("");
    if (!selected.length) return setError("Pick at least one account");
    if (action !== "draft" && problems.length) return setError("Fix the issues listed below first");
    setBusy(action);
    const body = {
      content,
      title: title || null,
      mediaIds: media.map((m) => m.id),
      action,
      scheduledAt: action === "now" ? null : when ? new Date(when).toISOString() : null,
      targets: selectedAccounts.map((a) => ({ accountId: a.id, contentOverride: overrides[a.platform] ?? null })),
    };
    const res = await fetch(initial ? `/api/posts/${initial.id}` : "/api/posts", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Couldn't save the post");
    router.push(action === "draft" ? "/posts?status=draft" : "/posts?status=upcoming");
    router.refresh();
  }

  const editingText = tab === "all" ? content : textFor(tab as Platform);
  const limit = tab === "all" ? Math.min(...platforms.map((p) => PLATFORM_INFO[p].charLimit), Infinity) : PLATFORM_INFO[tab as Platform].charLimit;
  const needsTitle = platforms.includes("youtube");

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {/* Accounts */}
        <section>
          <h2 className="label">Post to</h2>
          <ul className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = selected.includes(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    aria-pressed={on}
                    disabled={a.status === "expired"}
                    title={a.status === "expired" ? "Reconnect this account on the Accounts page" : undefined}
                    className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors disabled:opacity-40 ${on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}
                  >
                    <Avatar src={a.avatarUrl} name={a.name} platform={a.platform} />
                    {a.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Caption editor with per-platform tabs */}
        <section className="panel">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 pt-2">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>All platforms</TabButton>
            {platforms.map((p) => (
              <TabButton key={p} active={tab === p} onClick={() => setTab(p)}>
                <PlatformDot platform={p} size={8} />
                {PLATFORM_INFO[p].name}
                {overrides[p] !== undefined && <span className="text-accent" title="Customized">•</span>}
              </TabButton>
            ))}
            <button type="button" onClick={() => setAiOpen((o) => !o)} className="ml-auto mb-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/10" aria-expanded={aiOpen}>
              Write with AI
            </button>
          </div>

          {aiOpen && (
            <div className="space-y-3 border-b border-line bg-base/60 p-4">
              <label className="label" htmlFor="idea">What's the post about?</label>
              <textarea
                id="idea" className="input min-h-20" value={idea} onChange={(e) => setIdea(e.target.value)}
                placeholder="e.g. Launching my new Lightroom preset pack this Friday, 30% off for the first 48 hours"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone">
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <button type="button" className="btn-primary" disabled={aiBusy} onClick={() => runAi("write")}>
                  {aiBusy ? "Writing…" : "Write captions"}
                </button>
                <button type="button" className="btn-ghost" disabled={aiBusy || !content} onClick={() => runAi("improve")}>Improve my caption</button>
                <button type="button" className="btn-ghost" disabled={aiBusy || !content || platforms.length < 2} onClick={() => runAi("adapt")}>Tailor to each platform</button>
              </div>
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <button
                      key={h} type="button"
                      className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs hover:border-ink"
                      onClick={() => (tab === "all" ? setContent((c) => `${c} ${h}`.trim()) : setOverrides((o) => ({ ...o, [tab]: `${o[tab] ?? content} ${h}`.trim() })))}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-4">
            {tab !== "all" && (
              <p className="mb-2 text-sm text-muted">
                {overrides[tab] !== undefined ? (
                  <>Custom caption for {PLATFORM_INFO[tab as Platform].name}. <button type="button" className="underline" onClick={() => setOverrides(({ [tab]: _, ...rest }) => rest)}>Use the main caption instead</button></>
                ) : (
                  <>Using the main caption. Type here to customize it for {PLATFORM_INFO[tab as Platform].name}.</>
                )}
              </p>
            )}
            <textarea
              aria-label="Caption"
              className="min-h-48 w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted/70"
              placeholder="What do you want to share?"
              value={editingText}
              onChange={(e) => (tab === "all" ? setContent(e.target.value) : setOverrides((o) => ({ ...o, [tab]: e.target.value })))}
            />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{tab === "all" && platforms.length > 1 ? "Shortest limit among selected platforms" : ""}</span>
              {Number.isFinite(limit) && <CharMeter count={editingText.length} limit={limit} />}
            </div>
          </div>
        </section>

        {needsTitle && (
          <section>
            <label className="label" htmlFor="title">YouTube title</label>
            <input id="title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the first line of your caption" />
          </section>
        )}

        {/* Media */}
        <section>
          <h2 className="label">Media</h2>
          <div
            className="flex flex-wrap gap-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
          >
            {media.map((m, i) => (
              <figure key={m.id} className="group relative h-28 w-28 overflow-hidden rounded-lg border border-line bg-base">
                {m.kind === "video" ? (
                  <video src={m.url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                {m.kind === "video" && <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1.5 text-[11px] text-white">Video</span>}
                <div className="absolute inset-x-1 top-1 flex justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  {i > 0 ? (
                    <button type="button" aria-label="Move left" className="rounded bg-surface/90 px-1.5 text-xs" onClick={() => setMedia((arr) => { const a = [...arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}>‹</button>
                  ) : <span />}
                  <button type="button" aria-label="Remove" className="rounded bg-surface/90 px-1.5 text-xs text-bad" onClick={() => setMedia((arr) => arr.filter((x) => x.id !== m.id))}>Remove</button>
                </div>
              </figure>
            ))}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-28 w-28 flex-col items-center justify-center rounded-lg border border-dashed border-muted/50 text-sm text-muted hover:border-ink hover:text-ink"
            >
              {uploading ? `Uploading ${uploading}…` : <>Add photo<br />or video</>}
            </button>
            <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
        </section>

        {/* Problems + actions */}
        {selected.length > 0 && problems.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
            {[...new Set(problems)].map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{error}</p>}

        <section className="panel flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="when">Publish on</label>
            <input id="when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <button type="button" className="btn-ghost" disabled={!!busy || uploading > 0} onClick={() => submit("draft")}>
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" className="btn-ghost" disabled={!!busy || uploading > 0} onClick={() => submit("now")}>
            {busy === "now" ? "Queuing…" : "Publish now"}
          </button>
          <button type="button" className="btn-primary" disabled={!!busy || uploading > 0} onClick={() => submit("schedule")}>
            {busy === "schedule" ? "Scheduling…" : "Schedule"}
          </button>
        </section>
      </div>

      {/* Live previews */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <h2 className="label">Preview</h2>
        {selectedAccounts.length === 0 ? (
          <p className="panel p-6 text-sm text-muted">Pick an account to see how your post will look.</p>
        ) : (
          selectedAccounts.map((a) => <Preview key={a.id} account={a} text={textFor(a.platform as Platform)} media={media} />)
        )}
      </aside>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${active ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function CharMeter({ count, limit }: { count: number; limit: number }) {
  const ratio = count / limit;
  const color = ratio > 1 ? "var(--color-bad)" : ratio > 0.9 ? "var(--color-warn)" : "var(--color-ok)";
  return (
    <span className="flex items-center gap-2" aria-label={`${count} of ${limit} characters`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: color }} />
      </span>
      <span style={{ color: ratio > 0.9 ? color : undefined }}>
        {count.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </span>
  );
}

function Preview({ account, text, media }: { account: Account; text: string; media: MediaRef[] }) {
  const info = PLATFORM_INFO[account.platform as Platform];
  const first = media[0];
  const tall = ["tiktok", "youtube"].includes(account.platform) || (account.platform === "instagram" && first?.kind === "video");
  const over = text.length > info.charLimit;
  return (
    <article className="panel overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2" style={{ boxShadow: `inset 3px 0 0 ${info.color}` }}>
        <Avatar src={account.avatarUrl} name={account.name} platform={account.platform} />
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="text-xs text-muted">{info.name}{account.username ? ` · @${account.username}` : ""}</p>
        </div>
      </header>
      {first && (
        <div className={`relative bg-ink ${tall ? "mx-auto aspect-[9/16] max-h-80" : "aspect-square"}`}>
          {first.kind === "video" ? (
            <video src={first.url} className="h-full w-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={first.url} alt="" className="h-full w-full object-cover" />
          )}
          {media.length > 1 && <span className="absolute top-2 right-2 rounded-full bg-ink/75 px-2 text-xs text-white">1/{media.length}</span>}
        </div>
      )}
      <p className={`px-3 py-3 text-sm whitespace-pre-wrap ${over ? "text-bad" : ""}`}>
        {text ? (over ? <>{text.slice(0, info.charLimit)}<mark className="bg-bad/15 text-bad">{text.slice(info.charLimit)}</mark></> : text) : <span className="text-muted">Your caption appears here</span>}
      </p>
    </article>
  );
}
