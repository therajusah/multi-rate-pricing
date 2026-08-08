import type { ApiClientError } from "@/lib/client";


export function ErrorBox({ error }: { error: ApiClientError | null }) {
  if (!error) return null;

  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
      <p className="font-medium text-red-800">{error.message}</p>
      {error.details.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-700">
          {error.details.map((detail, index) => (
            <li key={`${detail.path}-${index}`}>
              <span className="font-mono text-xs">{detail.path}</span> — {detail.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
