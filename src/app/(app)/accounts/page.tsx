import { listAccounts } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { CONNECTABLE, PLATFORM_INFO } from "@/lib/platforms";
import { isConfigured } from "@/lib/social";
import { Avatar, PageHeader, PlatformDot, fmtDate } from "@/components/ui";
import { DisconnectButton } from "@/components/DisconnectButton";

const HINT: Record<string, string> = {
  facebook: "Connects your Facebook Pages and any Instagram professional accounts linked to them.",
  linkedin: "Posts to your personal LinkedIn profile.",
  x: "Text and up to 4 images per post.",
  threads: "Text, images and video.",
  youtube: "Uploads videos. Vertical videos under 3 minutes show up as Shorts.",
  tiktok: "Uploads videos. Posts are private until your TikTok app passes review.",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { connected, error } = await searchParams;
  const accounts = await listAccounts(user.id);

  return (
    <>
      <PageHeader title="Accounts" sub="Connect the profiles you want to post to." />

      {connected && <p className="mb-6 rounded-lg bg-ok/10 px-4 py-3 text-sm text-ok">Connected {connected}.</p>}
      {error && <p className="mb-6 rounded-lg bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Connected</h2>
        {accounts.length === 0 ? (
          <p className="panel p-6 text-muted">No accounts yet. Pick a platform below to connect one.</p>
        ) : (
          <ul className="panel divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar src={a.avatarUrl} name={a.name} platform={a.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="text-sm text-muted">
                    {PLATFORM_INFO[a.platform as keyof typeof PLATFORM_INFO]?.name}
                    {a.username ? ` · @${a.username}` : ""}
                    {a.tokenExpiresAt && a.status === "active" && !["x", "youtube", "tiktok"].includes(a.platform)
                      ? ` · reconnect by ${fmtDate(a.tokenExpiresAt, user.timezone, { hour: undefined, minute: undefined, year: "numeric" })}`
                      : ""}
                  </p>
                </div>
                {a.status !== "active" && (
                  <a href={`/api/connect/${PLATFORM_INFO[a.platform as keyof typeof PLATFORM_INFO].connectVia}`} className="btn-primary px-3 py-1">
                    Reconnect
                  </a>
                )}
                <DisconnectButton id={a.id} name={a.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add an account</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTABLE.map((p) => {
            const info = PLATFORM_INFO[p];
            const ready = isConfigured(p);
            return (
              <li key={p} className="panel flex flex-col p-4">
                <div className="flex items-center gap-2">
                  <PlatformDot platform={p} size={12} />
                  <h3 className="font-semibold">{p === "facebook" ? "Facebook + Instagram" : info.name}</h3>
                </div>
                <p className="mt-2 flex-1 text-sm text-muted">{HINT[p]}</p>
                {ready ? (
                  <a href={`/api/connect/${p}`} className="btn-ghost mt-4">Connect</a>
                ) : (
                  <p className="mt-4 rounded-lg bg-base px-3 py-2 text-xs text-muted">
                    Not set up yet. Add the {info.name} app keys as Worker secrets (see README).
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
