"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-danger px-3 py-1"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Disconnect ${name}? Scheduled posts to this account will be removed from their queue.`)) return;
        setBusy(true);
        await fetch(`/api/accounts/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Disconnect
    </button>
  );
}
