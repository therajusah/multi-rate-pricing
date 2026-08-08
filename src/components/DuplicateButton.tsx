"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, documentApi } from "@/lib/client";


export function DuplicateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-700">{error}</span>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const { document } = await documentApi.duplicate(id);
            router.push(`/documents/${document.id}`);
          } catch (caught) {
            setError((caught as ApiClientError).message);
            setPending(false);
          }
        }}
      >
        {pending ? "Duplicating…" : "Duplicate as draft"}
      </button>
    </div>
  );
}
