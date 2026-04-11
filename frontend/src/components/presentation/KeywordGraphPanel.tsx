type Edge = { source: string; target: string; weight?: number };
type Cluster = { id: number; keywords: string[] };
type Kw = { keyword: string; score: number };

export function KeywordGraphPanel({
  top_keywords,
  clusters,
  edges,
  total_nodes,
  total_edges,
}: {
  top_keywords?: Kw[];
  clusters?: Cluster[];
  edges?: Edge[];
  total_nodes?: number;
  total_edges?: number;
}) {
  const top = top_keywords || [];
  const eds = edges || [];
  const maxW = Math.max(...eds.map((e) => Number(e.weight) || 0), 1);

  return (
    <div className="space-y-6">
      {(total_nodes != null || total_edges != null) && (
        <p className="text-xs text-slate-500">
          Graph size: <strong className="text-slate-700">{total_nodes ?? "—"}</strong> terms ·{" "}
          <strong className="text-slate-700">{total_edges ?? "—"}</strong> co-occurrence links
        </p>
      )}

      {top.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Top terms (PageRank)</p>
          <div className="flex flex-wrap gap-2">
            {top.map((kw) => (
              <span
                key={kw.keyword}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800 shadow-sm"
                style={{ fontSize: `${Math.max(11, Math.min(15, 11 + kw.score * 400))}px` }}
              >
                {kw.keyword}
                <span className="ml-1 text-[10px] font-normal text-indigo-500">{(kw.score * 100).toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {eds.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Connections (co-occurrence)</p>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 font-semibold">Strength</th>
                </tr>
              </thead>
              <tbody>
                {eds.slice(0, 40).map((e, i) => {
                  const w = Number(e.weight) || 0;
                  const pct = Math.round((w / maxW) * 100);
                  return (
                    <tr key={`${e.source}-${e.target}-${i}`} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-800">{e.source}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{e.target}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-teal-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular-nums text-slate-500">{w}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {eds.length > 40 && (
              <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                Showing 40 of {eds.length} edges.
              </p>
            )}
          </div>
        </div>
      )}

      {clusters && clusters.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Theme clusters</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((cl) => (
              <div key={cl.id} className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/80 to-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase text-teal-700">Cluster {cl.id}</p>
                <p className="mt-2 text-sm leading-snug text-slate-700">{cl.keywords.join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
