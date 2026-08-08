"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, api } from "@/lib/client";
import { ErrorBox } from "./ErrorBox";

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4.5"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="m4 20 16-16" />}
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<ApiClientError | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const signup = mode === "signup";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    try {
      await api(signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      router.replace("/documents");
      router.refresh();
    } catch (caught) {
      setError(caught as ApiClientError);
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">
        {signup ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {signup ? "Documents are private to your account." : "Welcome back."}
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
        <ErrorBox error={error} />

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={revealed ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={8}
              className="field pr-10"
              placeholder={signup ? "At least 8 characters" : "••••••••"}
            />
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-400 transition hover:text-zinc-700 focus-visible:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
            >
              <EyeIcon crossed={revealed} />
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        {signup ? "Already have an account? " : "No account yet? "}
        <Link
          href={signup ? "/login" : "/signup"}
          className="font-medium text-zinc-900 underline underline-offset-4"
        >
          {signup ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
