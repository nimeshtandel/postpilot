import Link from "next/link";
import { PlatformDot, StatusPill, fmtDate } from "./ui";
import { PostActions } from "./PostActions";
import { platformName } from "@/lib/posts";

export type PostWithTargets = {
  id: string;
  content: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  targets: {
    id: string;
    status: string;
    error: string | null;
    externalUrl: string | null;
    account: { name: string; platform: string };
  }[];
};

export function PostRow({ post, tz }: { post: PostWithTargets; tz: string }) {
  const when = post.publishedAt ?? post.scheduledAt;
  const editable = ["draft", "scheduled", "failed"].includes(post.status);
  const failed = post.targets.filter((t) => t.status === "failed" && t.error);

  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="w-28 shrink-0 text-sm">
          <p className="font-semibold">{when ? fmtDate(when, tz, { hour: undefined, minute: undefined }) : "No date"}</p>
          {when && <p className="text-muted">{fmtDate(when, tz, { day: undefined, month: undefined })}</p>}
        </div>
        <div className="min-w-0 flex-1 basis-64">
          <p className="line-clamp-2 text-sm whitespace-pre-line">{post.content || <em className="text-muted">No caption</em>}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {post.targets.map((t) => {
              const label = `${t.account.name} on ${platformName(t.account.platform)}`;
              const chip = (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${t.status === "failed" ? "border-bad/40 text-bad" : t.status === "published" ? "border-ok/40" : "border-line"}`}>
                  <PlatformDot platform={t.account.platform} size={8} />
                  {t.account.name}
                </span>
              );
              return (
                <li key={t.id} title={label}>
                  {t.externalUrl ? <a href={t.externalUrl} target="_blank" rel="noreferrer" className="hover:underline">{chip}</a> : chip}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={post.status} />
          {editable && <Link href={`/compose?id=${post.id}`} className="btn-ghost px-3 py-1">Edit</Link>}
          <PostActions id={post.id} status={post.status} />
        </div>
      </div>
      {failed.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-bad">
          {failed.map((t) => (
            <li key={t.id}><span className="font-semibold">{t.account.name}:</span> {t.error}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
