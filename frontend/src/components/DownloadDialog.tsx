import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import {
  formatBytes,
  formatDuration,
  type DownloadState,
} from "@/hooks/useGameDownload";

interface DownloadDialogProps {
  open: boolean;
  state: DownloadState;
  filename?: string;
  onClose: () => void;
  onCancel: () => void;
  onSwitchToNormal?: () => void;
  onComplete?: (blob: Blob) => void;
}

const MODE_LABEL: Record<DownloadState["transport"], string> = {
  backend: "Normal Mode",
  p2p: "Browser Mode",
};

export function DownloadDialog({
  open,
  state,
  filename,
  onClose,
  onCancel,
  onSwitchToNormal,
  onComplete,
}: DownloadDialogProps) {
  useEffect(() => {
    if (state.status === "done" && state.blob && onComplete) {
      onComplete(state.blob);
    }
  }, [state.status, state.blob, onComplete]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pct = Math.max(0, Math.min(100, Math.round(state.progress * 100)));

  const showSwitchSuggestion =
    state.transport === "p2p" &&
    state.suggestFallback &&
    state.status !== "done" &&
    state.status !== "cancelled" &&
    !!onSwitchToNormal;

  const isInFlight =
    state.status === "downloading" ||
    state.status === "connecting" ||
    state.status === "metadata" ||
    state.status === "stuck";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              if (
                state.status === "done" ||
                state.status === "error" ||
                state.status === "cancelled" ||
                state.status === "idle"
              ) {
                onClose();
              }
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="relative z-10 w-full max-w-lg border-4 border-black bg-zinc-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
          >
            <header className="flex items-center justify-between border-b-4 border-black bg-[#FFD700] px-5 py-3">
              <div className="flex items-center gap-2">
                {state.status === "done" ? (
                  <CheckCircle2 className="size-5 text-black" />
                ) : state.status === "error" ? (
                  <AlertTriangle className="size-5 text-black" />
                ) : state.status === "stuck" ? (
                  <AlertTriangle className="size-5 text-black animate-pulse" />
                ) : (
                  <Loader2 className="size-5 text-black animate-spin" />
                )}
                <h2 className="text-base font-black uppercase text-black">
                  {state.status === "done"
                    ? "Download complete"
                    : state.status === "error"
                      ? "Download failed"
                      : state.status === "cancelled"
                        ? "Cancelled"
                        : state.status === "stuck"
                          ? "Slow / stuck"
                          : "Downloading"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-black hover:text-red-700 transition-colors"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="p-5 flex flex-col gap-4">
              {filename && (
                <p
                  className="font-mono text-xs text-zinc-300 break-all bg-zinc-800 border-2 border-black p-2"
                  title={filename}
                >
                  {filename}
                </p>
              )}

              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-400 mb-1.5">
                  <span>{pct}%</span>
                  <span>
                    {formatBytes(state.downloaded)} /{" "}
                    {state.totalSize ? formatBytes(state.totalSize) : "?"}
                  </span>
                </div>
                <div className="h-4 w-full bg-zinc-800 border-2 border-black p-0.5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      state.status === "done"
                        ? "bg-[#4ade80]"
                        : state.status === "error" ||
                            state.status === "cancelled"
                          ? "bg-red-500"
                          : state.status === "stuck"
                            ? "bg-orange-400"
                            : "bg-[#a855f7]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="border-2 border-black bg-zinc-800 p-2">
                  <p className="text-[9px] uppercase text-zinc-500 font-bold">
                    Speed
                  </p>
                  <p className="text-xs text-white font-mono font-bold">
                    {state.downloadSpeed > 0
                      ? `${formatBytes(state.downloadSpeed)}/s`
                      : "—"}
                  </p>
                </div>
                <div className="border-2 border-black bg-zinc-800 p-2 flex flex-col items-center">
                  <p className="text-[9px] uppercase text-zinc-500 font-bold flex items-center gap-1">
                    <Users className="size-3" /> Peers
                  </p>
                  <p className="text-xs text-white font-mono font-bold">
                    {state.numPeers ||
                      (state.transport === "backend" ? "?" : 0)}
                  </p>
                </div>
                <div className="border-2 border-black bg-zinc-800 p-2">
                  <p className="text-[9px] uppercase text-zinc-500 font-bold">
                    ETA
                  </p>
                  <p className="text-xs text-white font-mono font-bold">
                    {formatDuration(state.eta)}
                  </p>
                </div>
              </div>

              <div
                className={`border-2 border-black p-3 text-xs font-medium ${
                  state.status === "stuck"
                    ? "bg-orange-500/20 text-orange-200"
                    : state.status === "error"
                      ? "bg-red-500/20 text-red-200"
                      : state.status === "done"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {state.status === "error" ? (
                  <>{state.error || "Unknown error"}</>
                ) : (
                  <>{state.message || "Working…"}</>
                )}
              </div>

              {/* Browser Mode escalation: shown after 30 s without forward
                  progress, or on a P2P error. Always offers a single-click
                  fallback to Normal Mode. */}
              {showSwitchSuggestion && (
                <div className="border-2 border-orange-500 bg-orange-500/10 p-3 text-xs text-orange-100 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> Browser Mode is
                    struggling
                  </p>
                  <p>
                    No real progress in the last 30 seconds. Most ROM swarms
                    have very few WebRTC peers, so Browser Mode often stalls.
                    Switching to Normal Mode usually fixes it.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] uppercase text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3" />
                  Mode:{" "}
                  <strong className="text-white">
                    {MODE_LABEL[state.transport]}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {showSwitchSuggestion && (
                  <button
                    onClick={() => onSwitchToNormal?.()}
                    className="inline-flex items-center gap-1.5 border-2 border-black bg-orange-400 hover:bg-orange-500 text-black px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    <RefreshCw className="size-3.5" /> Switch to Normal Mode
                  </button>
                )}
                {/* On a P2P error we also offer the same fallback even if the
                    suggestion banner isn't showing. */}
                {!showSwitchSuggestion &&
                  state.status === "error" &&
                  state.transport === "p2p" &&
                  onSwitchToNormal && (
                    <button
                      onClick={() => onSwitchToNormal()}
                      className="inline-flex items-center gap-1.5 border-2 border-black bg-orange-400 hover:bg-orange-500 text-black px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                    >
                      <RefreshCw className="size-3.5" /> Try Normal Mode
                    </button>
                  )}
                {isInFlight && (
                  <button
                    onClick={onCancel}
                    className="border-2 border-black bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    Cancel
                  </button>
                )}
                {state.status === "done" && state.blob && (
                  <a
                    href={URL.createObjectURL(state.blob)}
                    download={filename || "download"}
                    className="inline-flex items-center gap-1.5 border-2 border-black bg-[#4ade80] hover:bg-[#22c55e] text-black px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    <Download className="size-3.5" /> Save file
                  </a>
                )}
                {(state.status === "done" ||
                  state.status === "error" ||
                  state.status === "cancelled") && (
                  <button
                    onClick={onClose}
                    className="border-2 border-black bg-white hover:bg-zinc-100 text-black px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
