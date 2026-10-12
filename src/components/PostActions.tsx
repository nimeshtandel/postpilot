"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PostActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    const res = await fetch(path, { method });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as any;
      alert(data.error ?? "Something went wrong");
    }
    router.refresh();
  }

  return (
    <>
      {(status === "failed" || status === "partial") && (
        <button className="btn-dark px-3 py-1" disabled={busy} onClick={() => call(`/api/posts/${id}/retry`, "POST")}>
          Retry
        </button>
      )}
      {status !== "publishing" && (
        <button
          className="btn-danger px-3 py-1"
          disabled={busy}
          onClick={() =>
            call(
              `/api/posts/${id}`,
              "DELETE",
              status === "published" || status === "partial"
                ? "Remove this post from PostPilot? It stays live on the platforms."
                : "Delete this post?",
            )
          }
        >
          Delete
        </button>
      )}
    </>
  );
}
