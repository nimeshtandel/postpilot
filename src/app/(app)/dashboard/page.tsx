import Link from "next/link";
import { countPosts, listAccounts, listPosts } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { PageHeader, Avatar } from "@/components/ui";
import { PostRow } from "@/components/PostRow";

export default async function Dashboard() {
  const user = await requireUser();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 864e5);

  const [accounts, upcoming, attention, publishedThisWeek, drafts] = await Promise.all([
    listAccounts(user.id),
    listPosts(user.id, ["scheduled", "publishing"], "scheduled", 8),
    listPosts(user.id, ["failed", "partial"], "recent", 5),
    countPosts(user.id, "published", new Date(now.getTime() - 7 * 864e5)),
    countPosts(user.id, "draft"),
  ]);

  const expired = accounts.filter((a) => a.status === "expired");
  const nextWeek = upcoming.filter((p) => p.scheduledAt && p.scheduledAt < weekAhead).length;
  const first = user.name?.split(" ")[0];

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome${first ? `, ${first}` : ""}`} />
        <section className="panel max-w-xl p-8">
          <h2 className="text-xl font-semibold">Connect your first account</h2>
          <p className="mt-2 text-muted">
            Link Instagram, Facebook, LinkedIn, X, Threads, YouTube or TikTok. Then you can write a post once and schedule it to all of them.
          </p>
          <Link href="/accounts" className="btn-primary mt-6">Connect accounts</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hi${first ? ` ${first}` : ""}`} sub={`${nextWeek} post${nextWeek === 1 ? "" : "s"} going out in the next 7 days`}>
        <Link href="/compose" className="btn-primary">New post</Link>
      </PageHeader>

      {expired.length > 0 && (
        <div className="mb-6 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm">
          <p className="font-semibold text-bad">
            {expired.map((a) => a.name).join(", ")} {expired.length === 1 ? "needs" : "need"} to be reconnected. Scheduled posts to {expired.length === 1 ? "it" : "them"} will fail until then.
          </p>
          <Link href="/accounts" className="mt-1 inline-block font-semibold underline">Go to accounts</Link>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {attention.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
              <div className="space-y-3">{attention.map((p) => <PostRow key={p.id} post={p} tz={user.timezone} />)}</div>
            </section>
          )}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Up next</h2>
              <Link href="/calendar" className="text-sm font-semibold underline">Open calendar</Link>
            </div>
            {upcoming.length ? (
              <div className="space-y-3">{upcoming.map((p) => <PostRow key={p.id} post={p} tz={user.timezone} />)}</div>
            ) : (
              <div className="panel p-8 text-center">
                <p className="text-muted">Nothing scheduled yet.</p>
                <Link href="/compose" className="btn-primary mt-4">Schedule a post</Link>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <dl className="panel grid grid-cols-2 divide-x divide-line">
            <div className="p-4">
              <dt className="text-sm text-muted">Published this week</dt>
              <dd className="font-display text-2xl font-semibold">{publishedThisWeek}</dd>
            </div>
            <Link href="/posts?status=draft" className="p-4 hover:bg-base">
              <dt className="text-sm text-muted">Drafts</dt>
              <dd className="font-display text-2xl font-semibold">{drafts}</dd>
            </Link>
          </dl>
          <section className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">Your accounts</h2>
              <Link href="/accounts" className="text-sm underline">Manage</Link>
            </div>
            <ul className="space-y-2.5">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <Avatar src={a.avatarUrl} name={a.name} platform={a.platform} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {a.status !== "active" && <span className="text-xs font-semibold text-bad">Reconnect</span>}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
