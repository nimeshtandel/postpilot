"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "signup") body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    router.push(mode === "signup" ? "/accounts" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <span className="font-display text-xl font-semibold">PostPilot</span>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Write once. Post everywhere, on your schedule.</h1>
          <p className="mt-4 text-white/70">
            Instagram, Facebook, LinkedIn, X, Threads, YouTube and TikTok from one calendar, with AI that adapts each caption to the platform.
          </p>
        </div>
        <div className="flex gap-2">
          {["#E1306C", "#1877F2", "#0A66C2", "#ffffff", "#9b9b9b", "#FF0000", "#00C2B8"].map((c) => (
            <span key={c} className="h-2 w-10 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h2>
          {mode === "signup" && (
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              className="input" id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {mode === "signup" && <p className="mt-1 text-xs text-muted">At least 8 characters</p>}
          </div>
          {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-sm text-muted">
            {mode === "login" ? (
              <>New here? <Link className="font-semibold text-ink underline" href="/signup">Create an account</Link></>
            ) : (
              <>Already have an account? <Link className="font-semibold text-ink underline" href="/login">Sign in</Link></>
            )}
          </p>
        </form>
      </section>
    </main>
  );
}
