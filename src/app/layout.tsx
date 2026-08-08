import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SignOutButton } from "@/components/SignOutButton";
import { getUserId } from "@/lib/auth";
import { users } from "@/lib/db";

export const metadata: Metadata = {
  title: "Pricing Calculator",
  description: "Quotes and proposals with server-side totals",
};

async function currentEmail(): Promise<string | null> {
  try {
    const userId = await getUserId();
    if (!userId) return null;
    const user = await (await users()).findOne({ _id: userId }, { projection: { email: 1 } });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const email = await currentEmail();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="no-print border-b border-zinc-200 bg-white">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Pricing Calculator
            </Link>
            {email && (
              <div className="flex items-center gap-3 text-sm">
                <span className="hidden text-zinc-500 sm:inline">{email}</span>
                <SignOutButton />
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
