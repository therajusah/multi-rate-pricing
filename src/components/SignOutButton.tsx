"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "@/lib/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-secondary py-1.5"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await api("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
