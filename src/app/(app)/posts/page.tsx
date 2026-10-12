import Link from "next/link";
import { listPosts } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PostRow } from "@/components/PostRow";

const TABS = [
  { key: "upcoming", label: "Scheduled", statuses: ["scheduled", "publishing"] },
  { key: "published", label: "Published", statuses: ["published", "partial"] },
  { key: "failed", label: "Failed", statuses: ["failed", "partial"] },
  { key: "draft", label: "Drafts", statuses: ["draft"] },
];

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status = "upcoming" } = await searchParams;
  const tab = TABS.find((t) => t.key === status) ?? TABS[0];

  const posts = await listPosts(user.id, tab.statuses, tab.key === "upcoming" ? "scheduled" : "recent");

  return (
    <>
      <PageHeader title="Posts">
        <Link href="/compose" className="btn-primary">New post</Link>
      </PageHeader>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/posts?status=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${t.key === tab.key ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {posts.length ? (
        <div className="space-y-3">{posts.map((p) => <PostRow key={p.id} post={p} tz={user.timezone} />)}</div>
      ) : (
        <p className="panel p-8 text-center text-muted">No {tab.label.toLowerCase()} posts.</p>
      )}
    </>
  );
}
