import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

interface AdminProps {
  appName: string;
}

const API = "/api";
const adminFetch = (path: string, key: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "x-admin-key": key,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  });

// ── Types ─────────────────────────────────────────────────────────────────────
interface PipelineState {
  status: "idle" | "running" | "done" | "error";
  mode: string | null;
  startedAt: string | null;
  endedAt: string | null;
  scrapeTotal: number;
  scrapeNew: number;
  queueSize: number;
  enriched: number;
  indexed: number;
  scrapeComplete: boolean;
  recentLogs: string[];
}
interface StatusData {
  postgres: {
    connected: boolean;
    latencyMs?: number;
    gameCount?: number;
    error?: string;
  };
  meilisearch: {
    connected: boolean;
    latencyMs?: number;
    documentCount?: number;
    isIndexing?: boolean;
    error?: string;
  };
}
interface ScheduleConfig {
  enabled: boolean;
  mode: "incremental" | "clean";
  expression: string;
}

// ── Cron expression presets ───────────────────────────────────────────────────
const PRESETS = [
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every 3 days at 2am", value: "0 2 */3 * *" },
  { label: "Every week (Sunday 3am)", value: "0 3 * * 0" },
  { label: "Every Monday at 4am", value: "0 4 * * 1" },
  { label: "1st of month at 5am", value: "0 5 1 * *" },
  { label: "Custom", value: "" },
];

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-400 animate-pulse" : "bg-red-500"}`}
    />
  );
}

function usePersistKey() {
  const [key, set] = useState(() => localStorage.getItem("adminKey") || "");
  const save = (k: string) => {
    localStorage.setItem("adminKey", k);
    set(k);
  };
  const clear = () => {
    localStorage.removeItem("adminKey");
    set("");
  };
  return [key, save, clear] as const;
}

export default function Admin({ appName }: AdminProps) {
  const [adminKey, setAdminKey, clearKey] = usePersistKey();
  const [inputKey, setInputKey] = useState(adminKey);
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);

  const [status, setStatus] = useState<StatusData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    enabled: false,
    mode: "incremental",
    expression: "",
  });
  const [schedulePreset, setSchedulePreset] = useState(PRESETS[0].value);
  const [scheduleCustom, setScheduleCustom] = useState("");
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  const [analytics, setAnalytics] = useState<{
    total: number;
    uniqueQueries: number;
    topQueries: { query: string; count: string; avg_results: string }[];
  } | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Ping ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/admin/ping`)
      .then((r) => r.json().then((d) => setAdminEnabled(d.enabled ?? false)))
      .catch(() => setAdminEnabled(false));
  }, []);

  const login = useCallback(
    async (k: string) => {
      const res = await adminFetch("/admin/status", k);
      if (res.ok) {
        setAdminKey(k);
        setAuthed(true);
        setAuthError("");
      } else {
        const b = await res.json().catch(() => ({}));
        setAuthError(b.error || "Invalid key.");
      }
    },
    [setAdminKey],
  );

  useEffect(() => {
    if (adminEnabled && adminKey && !authed) login(adminKey);
  }, [adminEnabled, adminKey, authed, login]);

  // ── Poll status + pipeline every 10s ──────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    const r = await adminFetch("/admin/status", adminKey);
    if (r.ok) setStatus(await r.json());
  }, [adminKey]);

  const fetchPipeline = useCallback(async () => {
    const r = await adminFetch("/admin/pipeline", adminKey);
    if (r.ok) setPipeline(await r.json());
  }, [adminKey]);

  const fetchSchedule = useCallback(async () => {
    const r = await adminFetch("/admin/schedule", adminKey);
    if (r.ok) {
      const cfg = await r.json();
      setSchedule(cfg);
      const preset = PRESETS.find(
        (p) => p.value === cfg.expression && p.value !== "",
      );
      if (preset) {
        setSchedulePreset(preset.value);
        setScheduleCustom("");
      } else {
        setSchedulePreset("");
        setScheduleCustom(cfg.expression || "");
      }
    }
  }, [adminKey]);

  useEffect(() => {
    if (!authed) return;
    fetchStatus();
    fetchPipeline();
    fetchSchedule();
    const interval = setInterval(() => {
      fetchStatus();
      fetchPipeline();
    }, 10000);
    return () => clearInterval(interval);
  }, [authed, fetchStatus, fetchPipeline, fetchSchedule]);

  // Auto-scroll logs
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [pipeline?.recentLogs?.length]);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const startPipeline = async (mode: "incremental" | "clean") => {
    const r = await adminFetch("/admin/pipeline/start", adminKey, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    if (r.ok) setTimeout(fetchPipeline, 500);
    else {
      const b = await r.json();
      alert(b.error);
    }
  };

  const saveSchedule = async () => {
    setScheduleError("");
    setScheduleSaved(false);
    const expr = schedulePreset !== "" ? schedulePreset : scheduleCustom;
    const cfg = { ...schedule, expression: expr };
    const r = await adminFetch("/admin/schedule", adminKey, {
      method: "POST",
      body: JSON.stringify(cfg),
    });
    if (r.ok) {
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
      fetchSchedule();
    } else {
      const b = await r.json();
      setScheduleError(b.error || "Failed to save.");
    }
  };

  const fetchAnalytics = async () => {
    const r = await adminFetch("/admin/analytics", adminKey);
    if (r.ok) setAnalytics(await r.json());
    setShowAnalytics(true);
  };

  const pipelineRunning = pipeline?.status === "running";
  const pipelineColor = {
    idle: "text-zinc-500",
    running: "text-yellow-400",
    done: "text-green-400",
    error: "text-red-400",
  }[pipeline?.status ?? "idle"];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-900 text-white">
      <Header appName={appName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-24 pb-10">
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        {/* Loading */}
        {adminEnabled === null && (
          <p className="text-zinc-500 text-sm">Connecting…</p>
        )}

        {/* Disabled */}
        {adminEnabled === false && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 text-center">
            <p className="text-lg mb-1">🔒 Admin Disabled</p>
            <p className="text-zinc-400 text-sm">
              Set <code className="bg-zinc-950 px-1 rounded">ADMIN_KEY</code> in
              your <code className="bg-zinc-950 px-1 rounded">.env</code> and
              restart the backend.
            </p>
          </div>
        )}

        {/* Login */}
        {adminEnabled === true && !authed && (
          <div className="max-w-sm rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 flex flex-col gap-3">
            <h2 className="font-semibold">Enter Admin Key</h2>
            <input
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login(inputKey)}
              placeholder="Admin key"
              className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-600 outline-none focus:border-zinc-400"
            />
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button
              onClick={() => {
                setAdminKey(inputKey);
                login(inputKey);
              }}
              className="rounded bg-white text-zinc-900 font-semibold py-2 text-sm hover:bg-zinc-100 transition"
            >
              Unlock
            </button>
          </div>
        )}

        {/* Dashboard */}
        {adminEnabled === true && authed && (
          <div className="flex flex-col gap-4">
            {/* Status row */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "PostgreSQL", data: status?.postgres },
                { label: "Meilisearch", data: status?.meilisearch },
              ].map(({ label, data }) => (
                <div
                  key={label}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-4 py-3 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium">{label}</span>
                  {data ? (
                    <div className="text-right text-xs text-zinc-400 flex items-center gap-2">
                      <Dot ok={data.connected} />
                      {data.connected ? (
                        <span>
                          <span className="text-white font-mono">
                            {data.latencyMs}ms
                          </span>{" "}
                          ·{" "}
                          <span className="text-white font-mono">
                            {("gameCount" in data
                              ? data.gameCount
                              : "documentCount" in data
                                ? data.documentCount
                                : undefined
                            )?.toLocaleString()}
                          </span>{" "}
                          {"gameCount" in data ? "games" : "docs"}
                        </span>
                      ) : (
                        <span className="text-red-400">Offline</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">…</span>
                  )}
                </div>
              ))}
            </div>

            {/* Pipeline control */}
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Pipeline</span>
                  {pipeline && (
                    <span
                      className={`text-xs font-mono uppercase font-bold ${pipelineColor}`}
                    >
                      {pipeline.status}
                      {pipelineRunning && pipeline.mode
                        ? ` (${pipeline.mode})`
                        : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={pipelineRunning}
                    onClick={() => startPipeline("incremental")}
                    className="rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 px-3 py-1.5 text-xs font-medium transition"
                  >
                    ▶ Incremental
                  </button>
                  <button
                    disabled={pipelineRunning}
                    onClick={() => {
                      if (
                        confirm(
                          "⚠ Clean mode wipes DB + Meilisearch. Continue?",
                        )
                      )
                        startPipeline("clean");
                    }}
                    className="rounded bg-red-950 hover:bg-red-900 border border-red-800 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-red-300 transition"
                  >
                    ⚠ Clean
                  </button>
                  {pipelineRunning && (
                    <button
                      onClick={async () => {
                        await adminFetch("/admin/pipeline/stop", adminKey, {
                          method: "POST",
                        });
                        setTimeout(fetchPipeline, 600);
                      }}
                      className="rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 transition"
                    >
                      ⏹ Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Queue stats */}
              {pipeline &&
                (pipeline.status !== "idle" || pipeline.scrapeTotal > 0) && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Scraped", value: pipeline.scrapeTotal },
                      {
                        label: "Queued",
                        value: pipeline.queueSize,
                        highlight: pipeline.queueSize > 0,
                      },
                      { label: "Enriched", value: pipeline.enriched },
                      { label: "Indexed", value: pipeline.indexed },
                    ].map(({ label, value, highlight }) => (
                      <div
                        key={label}
                        className="rounded bg-zinc-900 border border-zinc-700 py-2"
                      >
                        <p className="text-xs text-zinc-500">{label}</p>
                        <p
                          className={`text-base font-bold font-mono ${highlight ? "text-yellow-400" : ""}`}
                        >
                          {value.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

              {/* Log output */}
              {pipeline?.recentLogs && pipeline.recentLogs.length > 0 && (
                <div
                  ref={logRef}
                  className="h-40 overflow-y-auto rounded bg-zinc-950 border border-zinc-800 p-2 font-mono text-[11px] text-zinc-400 leading-relaxed"
                >
                  {pipeline.recentLogs.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.includes("ERROR") || line.includes("error")
                          ? "text-red-400"
                          : line.includes("Done") || line.includes("complete")
                            ? "text-green-400"
                            : ""
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {pipeline?.startedAt && (
                <p className="text-xs text-zinc-600">
                  {pipeline.startedAt &&
                    `Started ${new Date(pipeline.startedAt).toLocaleString()}`}
                  {pipeline.endedAt &&
                    ` · Ended ${new Date(pipeline.endedAt).toLocaleString()}`}
                </p>
              )}
            </div>

            {/* Scheduler */}
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Auto-Schedule</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-zinc-400">
                    {schedule.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    onClick={() =>
                      setSchedule((s) => ({ ...s, enabled: !s.enabled }))
                    }
                    className={`relative inline-flex h-5 w-9 rounded-full transition ${schedule.enabled ? "bg-green-600" : "bg-zinc-600"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${schedule.enabled ? "translate-x-4.5" : "translate-x-0.5"}`}
                    />
                  </button>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Preset
                  </label>
                  <select
                    value={schedulePreset}
                    onChange={(e) => setSchedulePreset(e.target.value)}
                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none"
                  >
                    {PRESETS.map((p) => (
                      <option key={p.label} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                {schedulePreset === "" && (
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">
                      Custom cron (UTC)
                    </label>
                    <input
                      value={scheduleCustom}
                      onChange={(e) => setScheduleCustom(e.target.value)}
                      placeholder="0 3 * * *"
                      className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-white outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Mode
                  </label>
                  <select
                    value={schedule.mode}
                    onChange={(e) =>
                      setSchedule((s) => ({
                        ...s,
                        mode: e.target.value as "incremental" | "clean",
                      }))
                    }
                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="incremental">Incremental</option>
                    <option value="clean">Clean</option>
                  </select>
                </div>
              </div>

              {schedule.enabled && (schedulePreset || scheduleCustom) && (
                <p className="text-xs text-zinc-400">
                  Next run determined by:{" "}
                  <code className="bg-zinc-950 px-1 rounded text-zinc-300">
                    {schedulePreset || scheduleCustom}
                  </code>{" "}
                  (UTC)
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveSchedule}
                  className="rounded bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 text-xs font-medium transition"
                >
                  Save Schedule
                </button>
                {scheduleSaved && (
                  <span className="text-green-400 text-xs">✓ Saved</span>
                )}
                {scheduleError && (
                  <span className="text-red-400 text-xs">{scheduleError}</span>
                )}
              </div>
            </div>

            {/* Analytics (collapsible) */}
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
              <button
                onClick={() => {
                  if (!showAnalytics) fetchAnalytics();
                  else setShowAnalytics(false);
                }}
                className="w-full flex items-center justify-between text-sm font-medium"
              >
                <span>Search Analytics</span>
                <span className="text-zinc-500 text-xs">
                  {showAnalytics ? "▲ hide" : "▼ show"}
                </span>
              </button>
              {showAnalytics && analytics && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex gap-4 text-sm">
                    <span className="text-zinc-400">
                      Total:{" "}
                      <span className="text-white font-mono">
                        {analytics.total.toLocaleString()}
                      </span>
                    </span>
                    <span className="text-zinc-400">
                      Unique:{" "}
                      <span className="text-white font-mono">
                        {analytics.uniqueQueries.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className="rounded bg-zinc-950 border border-zinc-800 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left p-2 text-zinc-500 font-normal">
                            Query
                          </th>
                          <th className="text-right p-2 text-zinc-500 font-normal">
                            Count
                          </th>
                          <th className="text-right p-2 text-zinc-500 font-normal">
                            Avg Results
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topQueries.map((q, i) => (
                          <tr
                            key={i}
                            className="border-b border-zinc-900 hover:bg-zinc-900"
                          >
                            <td className="p-2 font-mono text-white">
                              {q.query}
                            </td>
                            <td className="p-2 text-right text-zinc-300">
                              {parseInt(q.count).toLocaleString()}
                            </td>
                            <td className="p-2 text-right text-zinc-300">
                              {parseFloat(q.avg_results).toFixed(0)}
                            </td>
                          </tr>
                        ))}
                        {analytics.topQueries.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="p-3 text-center text-zinc-600"
                            >
                              No searches yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={fetchAnalytics}
                    className="text-xs text-zinc-500 hover:text-white self-start transition"
                  >
                    ↻ Refresh
                  </button>
                </div>
              )}
            </div>

            {/* Logout */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  clearKey();
                  setAuthed(false);
                  setInputKey("");
                }}
                className="text-xs text-zinc-600 hover:text-red-400 transition"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
