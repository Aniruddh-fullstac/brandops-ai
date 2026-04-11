/**
 * Renders arbitrary nested campaign data as readable UI — no raw JSON dumps.
 */
export function StructuredData({
  value,
  depth = 0,
  maxDepth = 10,
}: {
  value: unknown;
  depth?: number;
  maxDepth?: number;
}) {
  if (depth > maxDepth) return <span className="text-xs text-slate-400">…</span>;
  if (value === null || value === undefined) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const t = String(value);
    if (t.length > 280 && typeof value === "string") {
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value}</p>;
    }
    return <span className="text-sm text-slate-800">{t}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-slate-400">Empty list</span>;
    const allObj = value.every((x) => x && typeof x === "object" && !Array.isArray(x));
    if (allObj) {
      return (
        <div className="space-y-3">
          {value.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm"
            >
              <StructuredData value={item} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700">
        {value.map((item, i) => (
          <li key={i}>
            <StructuredData value={item} depth={depth + 1} maxDepth={maxDepth} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    );
    if (entries.length === 0) return <span className="text-sm text-slate-400">—</span>;
    return (
      <dl className="space-y-3">
        {entries.map(([key, val]) => (
          <div key={key}>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {humanizeKey(key)}
            </dt>
            <dd className="mt-1">
              {typeof val === "object" && val !== null ? (
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <StructuredData value={val} depth={depth + 1} maxDepth={maxDepth} />
                </div>
              ) : (
                <StructuredData value={val} depth={depth + 1} maxDepth={maxDepth} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}

function humanizeKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}
