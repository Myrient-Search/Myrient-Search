import { useCallback, useEffect, useRef, useState } from "react";
import { isP2PEnabled } from "@/lib/geo";
import {
  startDirectDownload,
  type DirectDownloadHandle,
  type DirectDownloadProgress,
} from "@/lib/webtorrent";

export type DownloadStatus =
  | "idle"
  | "connecting" // contacting trackers / asking backend to warm
  | "metadata" // got peers / metadata, file located, byte 0 imminent
  | "downloading" // bytes flowing
  | "stuck" // no progress for a while
  | "done"
  | "error"
  | "cancelled";

export interface DownloadState {
  status: DownloadStatus;
  transport: "backend" | "p2p";
  progress: number; // 0..1 of the requested file
  downloaded: number; // bytes of the requested file
  totalSize: number;
  downloadSpeed: number; // bytes/s
  numPeers: number; // 0 for backend HTTP path (peers live behind the proxy)
  eta: number | null; // seconds, null if unknown
  startedAt: number | null;
  message: string; // human-readable status line
  error: string | null;
  blob: Blob | null;
  // Set after SUGGEST_FALLBACK_MS without forward progress in Browser Mode.
  suggestFallback: boolean;
}

const initialState: DownloadState = {
  status: "idle",
  transport: "backend",
  progress: 0,
  downloaded: 0,
  totalSize: 0,
  downloadSpeed: 0,
  numPeers: 0,
  eta: null,
  startedAt: null,
  message: "",
  error: null,
  blob: null,
  suggestFallback: false,
};

const STUCK_BACKEND_MS = 20_000;
const SUGGEST_FALLBACK_MS = 30_000;

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface UseGameDownloadArgs {
  gameId?: string | number;
  filename?: string;
  magnet?: string | null;
  soId?: number | null;
}

export function useGameDownload({
  gameId,
  filename,
  magnet: magnetProp,
  soId: soIdProp,
}: UseGameDownloadArgs) {
  const [state, setState] = useState<DownloadState>(initialState);
  const abortRef = useRef<{
    abort: () => void;
    teardown?: () => void;
  } | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  const startBackend = useCallback(async (): Promise<void> => {
    if (!gameId) {
      setState((s) => ({
        ...s,
        status: "error",
        error: "Missing game id",
      }));
      return;
    }
    const ctrl = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let bytesAt = Date.now();
    let lastBytes = 0;
    let cancelled = false;

    const teardown = () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
    abortRef.current = {
      abort: () => {
        ctrl.abort();
        teardown();
      },
      teardown,
    };

    setState({
      ...initialState,
      transport: "backend",
      status: "connecting",
      startedAt: Date.now(),
      message: "Asking the backend to warm the torrent…",
    });

    try {
      await fetch(`/api/games/${gameId}/warm`, { method: "POST" });
    } catch {}

    pollTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/games/${gameId}/torrent-status`);
        if (!r.ok) return;
        const s = await r.json();
        setState((prev) => {
          if (prev.status === "downloading" || prev.status === "done") {
            return { ...prev, numPeers: s.numPeers ?? prev.numPeers };
          }
          const peers = s.numPeers ?? 0;
          const message = !s.loaded
            ? "Connecting to the swarm…"
            : !s.ready
              ? `Found ${peers} peer${peers === 1 ? "" : "s"}, fetching metadata…`
              : !s.fileFound
                ? "Locating file inside torrent…"
                : `Ready — ${peers} peer${peers === 1 ? "" : "s"}`;
          return {
            ...prev,
            numPeers: peers,
            totalSize: s.totalSize || prev.totalSize,
            message,
          };
        });
      } catch {}
    }, 1500);

    let response: Response;
    try {
      response = await fetch(`/api/proxy-download?id=${encodeURIComponent(gameId)}`, {
        signal: ctrl.signal,
      });
    } catch (err: unknown) {
      teardown();
      if ((err as { name?: string })?.name === "AbortError") {
        setState((s) => ({ ...s, status: "cancelled" }));
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: (err as Error).message,
      }));
      return;
    }

    if (!response.ok) {
      teardown();
      setState((s) => ({
        ...s,
        status: "error",
        error: `Backend returned HTTP ${response.status}`,
      }));
      return;
    }

    const totalHeader = response.headers.get("content-length");
    const total = totalHeader ? parseInt(totalHeader, 10) : 0;
    const reader = response.body?.getReader();
    if (!reader) {
      teardown();
      setState((s) => ({
        ...s,
        status: "error",
        error: "Browser does not support streaming responses.",
      }));
      return;
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    setState((s) => ({
      ...s,
      status: "downloading",
      totalSize: total || s.totalSize,
      message: "Streaming from the swarm…",
    }));

    const stuckTimer = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - bytesAt > STUCK_BACKEND_MS) {
        setState((prev) =>
          prev.status === "downloading"
            ? {
                ...prev,
                status: "stuck",
                message:
                  "No bytes received for a while — probably waiting on slow peers. Hold tight.",
              }
            : prev,
        );
      }
    }, 2000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const now = Date.now();
        if (received !== lastBytes) {
          bytesAt = now;
          lastBytes = received;
        }
        setState((prev) => {
          const elapsedSec = prev.startedAt
            ? (now - prev.startedAt) / 1000
            : 0;
          const speed = elapsedSec > 0 ? received / elapsedSec : 0;
          const remaining = (total || prev.totalSize) - received;
          const eta = speed > 0 && remaining > 0 ? remaining / speed : null;
          return {
            ...prev,
            status: "downloading",
            downloaded: received,
            totalSize: total || prev.totalSize,
            progress: total > 0 ? received / total : prev.progress,
            downloadSpeed: speed,
            eta,
            message: "Streaming from the swarm…",
          };
        });
      }
    } catch (err: unknown) {
      clearInterval(stuckTimer);
      teardown();
      if ((err as { name?: string })?.name === "AbortError") {
        setState((s) => ({ ...s, status: "cancelled" }));
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: (err as Error).message,
      }));
      return;
    }

    clearInterval(stuckTimer);
    teardown();

    const blob = new Blob(chunks as BlobPart[]);
    setState((prev) => ({
      ...prev,
      status: "done",
      downloaded: received,
      totalSize: received,
      progress: 1,
      downloadSpeed: 0,
      eta: 0,
      message: "Done.",
      blob,
    }));
  }, [gameId]);

  const startP2P = useCallback(async (): Promise<void> => {
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let lastDownloaded = 0;

    setState({
      ...initialState,
      transport: "p2p",
      status: "connecting",
      startedAt,
      message: "Resolving magnet…",
    });

    let magnet = magnetProp || null;
    let soId = soIdProp ?? null;
    let fname = filename;
    if (!magnet) {
      if (!gameId) {
        setState((s) => ({
          ...s,
          status: "error",
          error: "No magnet / game id provided.",
        }));
        return;
      }
      try {
        const r = await fetch(`/api/games/${gameId}/magnet`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        magnet = data.magnet;
        if (data.so_id != null) soId = data.so_id;
        if (data.filename) fname = data.filename;
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error: `Failed to fetch magnet: ${(err as Error).message}`,
        }));
        return;
      }
    }

    setState((s) => ({
      ...s,
      message: "Connecting to WebRTC peers…",
    }));

    const escalationTimer = setInterval(() => {
      const elapsedSinceProgress = Date.now() - lastProgressAt;
      if (elapsedSinceProgress > SUGGEST_FALLBACK_MS) {
        setState((prev) =>
          prev.status === "done" ||
          prev.status === "error" ||
          prev.status === "cancelled"
            ? prev
            : { ...prev, suggestFallback: true },
        );
      }
    }, 2000);

    let handle: DirectDownloadHandle | null = null;
    abortRef.current = {
      abort: () => {
        clearInterval(escalationTimer);
        handle?.abort();
      },
    };

    handle = await startDirectDownload({
      magnet: magnet!,
      soId,
      filename: fname,
      onUpdate: (p: DirectDownloadProgress) => {
        if (p.downloaded > lastDownloaded) {
          lastDownloaded = p.downloaded;
          lastProgressAt = Date.now();
        }
        setState((prev) => {
          const peerWord = (n: number) => (n === 1 ? "peer" : "peers");
          const message =
            p.status === "connecting"
              ? "Searching for WebRTC peers…"
              : p.status === "metadata"
                ? "Got metadata, opening file…"
                : p.status === "stuck"
                  ? p.numPeers === 0
                    ? "No WebRTC peers found yet. Browser Mode only reaches peers that speak WebRTC."
                    : "Connected, but no bytes flowing. The swarm may not have any browser-friendly peers."
                  : p.status === "downloading"
                    ? `Streaming from ${p.numPeers} ${peerWord(p.numPeers)}…`
                    : p.status === "done"
                      ? "Done."
                      : p.status === "error"
                        ? p.error || "Torrent error"
                        : prev.message;

          if (p.status === "error") {
            clearInterval(escalationTimer);
            return {
              ...prev,
              status: "error",
              error: p.error || "Torrent error",
              message,
              suggestFallback: true,
            };
          }
          if (p.status === "done") {
            clearInterval(escalationTimer);
            return {
              ...prev,
              status: "done",
              progress: 1,
              downloaded: p.totalSize,
              totalSize: p.totalSize,
              downloadSpeed: 0,
              eta: 0,
              numPeers: p.numPeers,
              blob: p.blob ?? null,
              message,
              suggestFallback: false,
            };
          }
          // Once bytes are flowing, clear any earlier suggestion — the user
          // is no longer stuck.
          const stillStuck = Date.now() - lastProgressAt > SUGGEST_FALLBACK_MS;
          return {
            ...prev,
            status:
              p.status === "stuck"
                ? "stuck"
                : p.status === "downloading"
                  ? "downloading"
                  : p.status === "metadata"
                    ? "metadata"
                    : "connecting",
            progress: p.progress,
            downloaded: p.downloaded,
            totalSize: p.totalSize,
            downloadSpeed: p.downloadSpeed,
            numPeers: p.numPeers,
            eta: p.eta,
            message,
            suggestFallback: stillStuck,
          };
        });
      },
    });
  }, [gameId, magnetProp, soIdProp, filename]);

  const start = useCallback(
    (opts?: { forceTransport?: "backend" | "p2p" }) => {
      const useP2P =
        opts?.forceTransport === "p2p" ||
        (opts?.forceTransport !== "backend" && isP2PEnabled());
      if (useP2P) return startP2P();
      return startBackend();
    },
    [startBackend, startP2P],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) =>
      s.status === "done" || s.status === "error" || s.status === "idle"
        ? s
        : { ...s, status: "cancelled", message: "Cancelled." },
    );
  }, []);

  const switchToNormal = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      ...initialState,
      transport: "backend",
      status: "connecting",
      startedAt: Date.now(),
      message: "Switching to Normal Mode…",
    });
    queueMicrotask(() => {
      void startBackend();
    });
  }, [startBackend]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { state, start, cancel, reset, switchToNormal };
}
