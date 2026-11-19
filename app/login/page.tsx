"use client";

// ──────────────────────────────────────────────────────────────────────
// WHAT: The sign-in page (/login). Runs in the browser ("use client").
// HOW:  - Email link: Supabase emails a one-time link -> it opens /auth/callback -> you are signed in.
//       - Password: for accounts created in the Supabase dashboard (Authentication -> Users -> Add user).
//       - Google: only shown if NEXT_PUBLIC_GOOGLE_AUTH=true and Google is set up in Supabase.
//       Errors from other pages arrive as ?error=... in the address and are shown here.
// ──────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Please request a new one.",
  profile:
    "You're signed in, but your profile couldn't be loaded. If you just set up the database, run supabase/schema.sql, then sign out and sign in again.",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    setErrorCode(code);
    if (code) setError(ERRORS[code] ?? "Sign-in failed. Please try again.");
  }, []);

  function redirectTo() {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  // Password sign-in (for accounts created in Supabase → Authentication → Users → Add user).
  async function signInWithPassword() {
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setState("idle");
      setError(/invalid/i.test(error.message) ? "Wrong email or password." : error.message);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    window.location.assign(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  // Form submit: email link by default, or password if the person switched to it.
  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    if (usePassword) return signInWithPassword();
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      setState("idle");
      // The database rejects emails outside the allowed domain while creating the user.
      setError(
        /database error/i.test(error.message)
          ? "This email address is not allowed to sign in. Use your college email."
          : /rate limit/i.test(error.message)
            ? "Too many sign-in emails were sent in the last hour. Try again later, or sign in with a password."
            : error.message,
      );
      return;
    }
    setState("sent");
  }

  // "Continue with Google" (only shown when NEXT_PUBLIC_GOOGLE_AUTH=true).
  async function google() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">CO Mapping</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to view and edit course outcome mappings.</p>

        <div className="card mt-6">
          {state === "sent" ? (
            <div className="text-sm">
              <p className="font-medium">Check your email</p>
              <p className="mt-1 text-slate-600">
                We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.
              </p>
              <button className="btn mt-4" onClick={() => setState("idle")}>
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-3">
              <div>
                <label className="label" htmlFor="email">
                  College email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input"
                  placeholder="name@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {usePassword && (
                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
              <button className="btn btn-primary w-full py-2" disabled={state === "sending"}>
                {state === "sending" ? (usePassword ? "Signing in…" : "Sending…") : usePassword ? "Sign in" : "Email me a sign-in link"}
              </button>
              <button
                type="button"
                className="w-full text-center text-xs text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setUsePassword(!usePassword);
                  setError(null);
                }}
              >
                {usePassword ? "Use an email link instead" : "Sign in with a password instead"}
              </button>
              {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true" && (
                <>
                  <div className="py-1 text-center text-xs text-slate-400">or</div>
                  <button type="button" className="btn w-full py-2" onClick={google}>
                    Continue with Google
                  </button>
                </>
              )}
            </form>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {errorCode === "profile" && (
            <form action="/auth/signout" method="post" className="mt-3">
              <button className="btn w-full">Sign out</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
