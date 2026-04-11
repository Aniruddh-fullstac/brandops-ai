import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Globe,
  TrendingUp,
  Swords,
  Share2,
  Target,
  Palette,
  Network,
  BarChart3,
  Database,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaignStore } from "../components/CampaignStore";
import { apiFetch } from "../lib/api";

// ── Types ───────────────────────────────────────────────────────
type AgentInfo = { id: string; name: string; icon: string };
type Source = { url: string; title?: string };
type AgentResult = {
  agent_id: string;
  agent_name: string;
  icon: string;
  output: string;
  sources?: Source[];
  web_queries?: string[];
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  agents?: AgentInfo[];
  agentResults?: AgentResult[];
  sources?: Source[];
  reasoning?: string;
  loading?: boolean;
  agentWorking?: { agent_id: string; agent_name: string; status: string }[];
};

// ── Icon map ────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  swords: <Swords size={14} />,
  "share-2": <Share2 size={14} />,
  "trending-up": <TrendingUp size={14} />,
  globe: <Globe size={14} />,
  target: <Target size={14} />,
  palette: <Palette size={14} />,
  network: <Network size={14} />,
  "bar-chart-3": <BarChart3 size={14} />,
  database: <Database size={14} />,
};
function getAgentIcon(icon: string, size = 14) {
  const map: Record<string, React.ReactNode> = {
    swords: <Swords size={size} />,
    "share-2": <Share2 size={size} />,
    "trending-up": <TrendingUp size={size} />,
    globe: <Globe size={size} />,
    target: <Target size={size} />,
    palette: <Palette size={size} />,
    network: <Network size={size} />,
    "bar-chart-3": <BarChart3 size={size} />,
    database: <Database size={size} />,
  };
  return map[icon] || <Bot size={size} />;
}

// ── Agent color palette ─────────────────────────────────────────
const AGENT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; icon: string }> = {
  competitor_intel: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500", icon: "bg-rose-100" },
  social_intel: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-500", icon: "bg-violet-100" },
  market_trends: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", icon: "bg-emerald-100" },
  brand_analyst: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500", icon: "bg-blue-100" },
  strategy: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500", icon: "bg-amber-100" },
  creative_suite: { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", dot: "bg-pink-500", icon: "bg-pink-100" },
  keyword_engine: { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-500", icon: "bg-cyan-100" },
  performance_sim: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500", icon: "bg-orange-100" },
  knowledge_base: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500", icon: "bg-indigo-100" },
  synthesizer: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", dot: "bg-slate-500", icon: "bg-slate-100" },
};
function getAgentColor(agentId: string) {
  return AGENT_COLORS[agentId] || { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", dot: "bg-slate-500", icon: "bg-slate-100" };
}

// ── Markdown-lite renderer (compact) ────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-4 space-y-0.5 my-1.5">
          {listItems.map((item, i) => (
            <li key={i} className="text-[13px] text-slate-700 leading-snug">{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={i} className="text-[13px] font-bold text-slate-900 mt-3 mb-0.5">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={i} className="text-sm font-bold text-slate-900 mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={i} className="text-[15px] font-bold text-slate-900 mt-3 mb-1">{line.slice(2)}</h1>);
    } else if (line.match(/^[-*]\s/)) {
      listItems.push(line.replace(/^[-*]\s/, ""));
    } else if (line.match(/^\d+\.\s/)) {
      listItems.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.trim() === "") {
      flushList();
    } else if (line.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={i} className="border-l-2 border-indigo-300 pl-2.5 my-1.5 text-[13px] text-slate-500 italic">
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else {
      flushList();
      elements.push(<p key={i} className="text-[13px] text-slate-700 leading-snug my-0.5">{renderInline(line)}</p>);
    }
  }
  flushList();
  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ── Suggestion chips ────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: <Swords size={14} />, label: "Who are the top competitors?" },
  { icon: <TrendingUp size={14} />, label: "What market trends should we watch?" },
  { icon: <Share2 size={14} />, label: "What's working on social media?" },
  { icon: <Palette size={14} />, label: "Generate creative ad concepts" },
  { icon: <Target size={14} />, label: "Suggest a channel strategy" },
  { icon: <BarChart3 size={14} />, label: "Forecast campaign performance" },
];

// ── Collapsible Agent Card (compact) ────────────────────────────
function AgentResultCard({ result, defaultOpen = false }: { result: AgentResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const color = getAgentColor(result.agent_id);
  const output = result.output || "";
  // Extract first meaningful line as summary
  const summaryLine = output.split("\n").find((l) => l.trim().length > 10 && !l.startsWith("#"))?.trim() || "";
  const sourceCount = result.sources?.length || 0;
  const searchCount = result.web_queries?.length || 0;

  return (
    <div className={cn("rounded-lg border transition-all", color.border, open ? color.bg : "bg-white hover:bg-slate-50/50")}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left"
      >
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", color.icon, color.text)}>
          {getAgentIcon(result.icon, 12)}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-semibold leading-tight", color.text)}>{result.agent_name}</p>
          {!open && summaryLine && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{summaryLine.slice(0, 80)}...</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {searchCount > 0 && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <Search size={9} />{searchCount}
            </span>
          )}
          {sourceCount > 0 && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <ExternalLink size={9} />{sourceCount}
            </span>
          )}
          <ChevronRight size={12} className={cn("text-slate-400 transition-transform", open && "rotate-90")} />
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-3 pb-3 border-t border-slate-200/50">
          <div className="mt-2 max-h-[280px] overflow-y-auto thin-scroll pr-1">
            {renderMarkdown(output)}
          </div>
          {result.sources && result.sources.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-200/40">
              {result.sources.slice(0, 4).map((s, i) => {
                let hostname = "";
                try { hostname = new URL(s.url).hostname; } catch { hostname = s.url; }
                return (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 rounded text-[10px] text-slate-400 hover:text-indigo-600 border border-slate-200/60 hover:border-indigo-200 transition-colors truncate max-w-[150px]"
                  >
                    <ExternalLink size={7} className="flex-shrink-0" />
                    {s.title || hostname}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Chat Page ──────────────────────────────────────────────
export default function AskAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { campaignId, artifacts, campaignList } = useCampaignStore();

  const currentCampaign = campaignList.find((c) => c.id === campaignId);
  const brandName = currentCampaign?.brand_name;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const sendMessage = async (query: string) => {
    if (!query.trim() || isStreaming) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: query.trim() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId, role: "assistant", content: "",
      loading: true, agents: [], agentResults: [], agentWorking: [], sources: [],
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await apiFetch("/api/chat/query", {
        method: "POST",
        body: JSON.stringify({
          query: query.trim(),
          brand_name: brandName || undefined,
          campaign_id: campaignId || undefined,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const event = parsed.event as string;
            const payload = parsed.payload as Record<string, unknown>;

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                switch (event) {
                  case "agents_selected":
                    return { ...m, agents: payload.agents as AgentInfo[], reasoning: payload.reasoning as string };
                  case "agent_working":
                    return {
                      ...m,
                      agentWorking: [
                        ...(m.agentWorking || []).filter((w) => w.agent_id !== (payload.agent_id as string)),
                        payload as ChatMessage["agentWorking"] extends (infer T)[] ? T : never,
                      ],
                    };
                  case "agent_result":
                    return {
                      ...m,
                      agentResults: [...(m.agentResults || []), payload as AgentResult],
                      agentWorking: (m.agentWorking || []).filter((w) => w.agent_id !== (payload as AgentResult).agent_id),
                    };
                  case "chat_answer":
                    return { ...m, content: payload.answer as string, sources: payload.sources as Source[], loading: false };
                  case "chat_failed":
                    return { ...m, content: `Error: ${payload.error}`, loading: false };
                  default:
                    return m;
                }
              })
            );
          } catch { /* skip */ }
        }
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, loading: false } : m)));
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: `Connection error: ${err}`, loading: false } : m)
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] lg:h-screen bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center mb-4">
              <Sparkles size={22} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1 font-display">Ask your AI agents</h1>
            <p className="text-sm text-slate-500 mb-8 text-center max-w-md">
              {brandName
                ? `Get real-time insights about ${brandName}, competitors, market trends, and creative strategies.`
                : "Select a campaign from the sidebar, then ask questions about your brand, competitors, and market."}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl w-full">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => void sendMessage(s.label)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-slate-200 hover:border-indigo-300 text-left transition-all group"
                >
                  <span className="text-slate-400 group-hover:text-indigo-600 transition-colors flex-shrink-0">{s.icon}</span>
                  <span className="text-xs text-slate-600 group-hover:text-indigo-700">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="w-full px-6 lg:px-10 py-5 space-y-5">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  /* ── User bubble ── */
                  <div className="flex justify-end mb-1">
                    <div className="flex items-start gap-2 max-w-2xl">
                      <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={12} className="text-indigo-600" />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Assistant response ── */
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">

                      {/* Agent pills + working state in a compact header bar */}
                      {((msg.agents && msg.agents.length > 0) || (msg.agentWorking && msg.agentWorking.length > 0)) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {msg.agents && msg.agents.length > 0 && (
                            <>
                              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mr-1">Agents</span>
                              {msg.agents.map((a) => {
                                const color = getAgentColor(a.id);
                                const isWorking = msg.agentWorking?.some((w) => w.agent_id === a.id);
                                return (
                                  <div
                                    key={a.id}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border",
                                      color.bg, color.border, color.text
                                    )}
                                  >
                                    {isWorking && <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", color.dot)} />}
                                    {getAgentIcon(a.icon, 10)}
                                    {a.name}
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}

                      {/* Loading state */}
                      {msg.loading && !msg.content && !(msg.agentResults && msg.agentResults.length > 0) && (
                        <div className="flex items-center gap-2 text-slate-400 py-1">
                          <Loader2 size={13} className="animate-spin" />
                          <span className="text-xs">
                            {msg.agentWorking && msg.agentWorking.length > 0
                              ? `${msg.agentWorking[0].agent_name} is researching...`
                              : "Thinking..."}
                          </span>
                        </div>
                      )}

                      {/* Two-column layout: answer left, agent cards right */}
                      {(msg.content || (msg.agentResults && msg.agentResults.length > 0)) && (
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

                          {/* Left column — Synthesized answer (3/5 width) */}
                          <div className={cn(
                            "xl:col-span-3",
                            msg.agentResults && msg.agentResults.length > 0 ? "" : "xl:col-span-5"
                          )}>
                            {msg.content && (
                              <div className="bg-slate-50/80 rounded-xl px-4 py-3 border border-slate-100">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <Zap size={11} className="text-indigo-600" />
                                  <span className="text-[10px] uppercase tracking-wider text-indigo-600 font-bold">
                                    Synthesized Answer
                                  </span>
                                </div>
                                {renderMarkdown(msg.content)}

                                {/* Sources inline at bottom of answer */}
                                {msg.sources && msg.sources.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-slate-200/60">
                                    <span className="text-[10px] text-slate-400 font-semibold mr-1 self-center">Sources</span>
                                    {msg.sources.map((s, i) => {
                                      let hostname = "";
                                      try { hostname = new URL(s.url).hostname; } catch { hostname = s.url; }
                                      return (
                                        <a
                                          key={i}
                                          href={s.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded text-[10px] text-slate-400 hover:text-indigo-600 border border-slate-200/60 hover:border-indigo-200 transition-colors truncate max-w-[160px]"
                                        >
                                          <ExternalLink size={7} className="flex-shrink-0" />
                                          {s.title || hostname}
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Still loading the answer but have agent results */}
                            {!msg.content && msg.loading && msg.agentResults && msg.agentResults.length > 0 && (
                              <div className="flex items-center gap-2 text-slate-400 py-2 bg-slate-50/80 rounded-xl px-4 border border-slate-100">
                                <Loader2 size={13} className="animate-spin" />
                                <span className="text-xs">Synthesizing agent findings...</span>
                              </div>
                            )}
                          </div>

                          {/* Right column — Agent finding cards (2/5 width) */}
                          {msg.agentResults && msg.agentResults.length > 0 && (
                            <div className="xl:col-span-2 space-y-1.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Layers size={11} className="text-slate-400" />
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                                  Agent Findings ({msg.agentResults.length})
                                </span>
                              </div>
                              {msg.agentResults.map((r, idx) => (
                                <AgentResultCard key={r.agent_id} result={r} defaultOpen={idx === 0} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input area ── */}
      <div className="border-t border-slate-100 bg-white px-6 lg:px-10 py-3">
        <div className="max-w-4xl">
          <div className="relative flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={brandName ? `Ask about ${brandName}, competitors, trends...` : "Ask a marketing question..."}
              rows={1}
              disabled={isStreaming}
              className={cn(
                "flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400",
                "focus:outline-none min-h-[36px] max-h-[160px] py-1.5",
                "disabled:opacity-50"
              )}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className={cn(
                "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                input.trim() && !isStreaming
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                  : "bg-slate-200 text-slate-400"
              )}
            >
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <p className="text-[10px] text-slate-400">
              {brandName && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Context: {brandName}
                </span>
              )}
            </p>
            <p className="text-[10px] text-slate-400">Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}
