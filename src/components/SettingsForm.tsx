"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsForm(props: { name: string; email: string; timezone: string; zones: string[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    const data = (await res.json()) as any;
    setMsg(res.ok ? { ok: true, text: "Settings saved" } : { ok: false, text: data.error });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel max-w-lg space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input className="input" id="name" name="name" defaultValue={props.name} required />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input bg-base" id="email" value={props.email} disabled />
      </div>
      <div>
        <label className="label" htmlFor="timezone">Time zone</label>
        <select className="input" id="timezone" name="timezone" defaultValue={props.timezone}>
          {props.zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">Used to show dates on your calendar and post lists.</p>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      <button className="btn-dark">Save settings</button>
    </form>
  );
}
