import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, media as mediaTable, posts } from "@/lib/db";
import { listAccounts } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { publicMediaUrl } from "@/lib/media";
import { Composer, type ComposerInitial } from "@/components/Composer";
import { PageHeader } from "@/components/ui";

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ id?: string; date?: string }> }) {
  const user = await requireUser();
  const { id, date } = await searchParams;

  const accounts = (await listAccounts(user.id)).map(({ id, platform, name, username, avatarUrl, status }) => ({
    id, platform, name, username, avatarUrl, status,
  }));

  let initial: ComposerInitial | undefined;
  if (id) {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, id), eq(posts.userId, user.id)),
      with: { targets: true },
    });
    if (!post) notFound();
    const ids: string[] = JSON.parse(post.mediaIds);
    const media = ids.length
      ? await db.select().from(mediaTable).where(and(inArray(mediaTable.id, ids), eq(mediaTable.userId, user.id)))
      : [];
    const overrides: Record<string, string> = {};
    for (const t of post.targets) {
      const acc = accounts.find((a) => a.id === t.accountId);
      if (acc && t.contentOverride) overrides[acc.platform] = t.contentOverride;
    }
    initial = {
      id: post.id,
      status: post.status,
      content: post.content,
      title: post.title ?? "",
      accountIds: post.targets.map((t) => t.accountId),
      overrides,
      media: ids
        .map((mid) => media.find((m) => m.id === mid))
        .filter((m) => !!m)
        .map((m) => ({ id: m.id, url: publicMediaUrl(m.fileName), kind: m.kind as "image" | "video", mimeType: m.mimeType })),
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
    };
  }

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="New post" />
        <section className="panel max-w-xl p-8">
          <p className="text-muted">Connect at least one account before writing a post.</p>
          <Link href="/accounts" className="btn-primary mt-4">Connect accounts</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title={initial ? "Edit post" : "New post"} />
      <Composer accounts={accounts} initial={initial} defaultDate={/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : undefined} />
    </>
  );
}
