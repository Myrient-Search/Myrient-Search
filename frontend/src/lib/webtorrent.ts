// Browser WebTorrent. Only loaded when Browser Mode is enabled.
import type WebTorrent from "webtorrent";

type Torrent = WebTorrent.Torrent;
type TorrentFile = WebTorrent.TorrentFile;
type Instance = WebTorrent.Instance;
type Ctor = new (opts?: unknown) => Instance;

let _client: Instance | null = null;
let _ctorPromise: Promise<Ctor> | null = null;

async function loadCtor(): Promise<Ctor> {
  if (!_ctorPromise) {
    _ctorPromise = import("webtorrent").then(
      (m) => ((m as unknown as { default?: Ctor }).default || m) as Ctor,
    );
  }
  return _ctorPromise;
}

async function getClient(): Promise<Instance> {
  if (_client) return _client;
  const Ctor = await loadCtor();
  const inst = new Ctor();
  _client = inst;
  return inst;
}

export interface DirectDownloadProgress {
  status:
    | "connecting"
    | "metadata"
    | "downloading"
    | "stuck"
    | "done"
    | "error";
  progress: number; // 0..1
  downloaded: number;
  totalSize: number;
  downloadSpeed: number; // bytes/s
  numPeers: number;
  eta: number | null; // seconds remaining, null if unknown
  error?: string;
  blob?: Blob;
}

export interface DirectDownloadHandle {
  abort: () => void;
}

const STUCK_THRESHOLD_MS = 20_000;

interface StartArgs {
  magnet: string;
  soId?: number | null;
  filename?: string;
  onUpdate: (p: DirectDownloadProgress) => void;
}

function pickFile(
  torrent: Torrent,
  soId: number | null | undefined,
  filename: string | undefined,
): TorrentFile | null {
  if (typeof soId === "number" && soId >= 0 && soId < torrent.files.length) {
    return torrent.files[soId];
  }
  if (filename) {
    const exact = torrent.files.find((f) => f.name === filename);
    if (exact) return exact;
    const tail = torrent.files.find((f) => f.path.endsWith(filename));
    if (tail) return tail;
  }
  return null;
}

export async function startDirectDownload({
  magnet,
  soId,
  filename,
  onUpdate,
}: StartArgs): Promise<DirectDownloadHandle> {
  const client = await getClient();

  let torrent: Torrent | null = null;
  let aborted = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let lastDownloaded = 0;
  let lastProgressAt = Date.now();

  onUpdate({
    status: "connecting",
    progress: 0,
    downloaded: 0,
    totalSize: 0,
    downloadSpeed: 0,
    numPeers: 0,
    eta: null,
  });

  const tick = () => {
    if (!torrent || aborted) return;
    const file = pickFile(torrent, soId, filename);
    const totalSize = file ? file.length : torrent.length;
    const downloaded = file
      ? Math.floor((file.progress || 0) * file.length)
      : torrent.downloaded;
    if (downloaded > lastDownloaded) {
      lastDownloaded = downloaded;
      lastProgressAt = Date.now();
    }
    const stuck =
      torrent.numPeers === 0 ||
      Date.now() - lastProgressAt > STUCK_THRESHOLD_MS;
    const remaining = totalSize - downloaded;
    const eta =
      torrent.downloadSpeed > 0 ? remaining / torrent.downloadSpeed : null;

    onUpdate({
      status: stuck ? "stuck" : "downloading",
      progress: file ? file.progress : torrent.progress,
      downloaded,
      totalSize,
      downloadSpeed: torrent.downloadSpeed,
      numPeers: torrent.numPeers,
      eta,
    });
  };

  const cleanup = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (torrent) {
      try {
        torrent.destroy({ destroyStore: true });
      } catch {
        // ignore
      }
    }
  };

  client.add(magnet, (t: Torrent) => {
    if (aborted) {
      try {
        t.destroy({ destroyStore: true });
      } catch {}
      return;
    }
    torrent = t;
    onUpdate({
      status: "metadata",
      progress: 0,
      downloaded: 0,
      totalSize: t.length,
      downloadSpeed: 0,
      numPeers: t.numPeers,
      eta: null,
    });

    try {
      t.deselect(0, t.pieces.length - 1, 0);
    } catch {}
    const file = pickFile(t, soId, filename);
    if (!file) {
      onUpdate({
        status: "error",
        progress: 0,
        downloaded: 0,
        totalSize: 0,
        downloadSpeed: 0,
        numPeers: t.numPeers,
        eta: null,
        error:
          "File not found inside torrent. The torrent may have been re-packed.",
      });
      cleanup();
      return;
    }
    file.select();

    interval = setInterval(tick, 750);
    tick();

    file.getBlob((err: Error | string | undefined, blob?: Blob) => {
      if (aborted) return;
      if (err) {
        onUpdate({
          status: "error",
          progress: 0,
          downloaded: 0,
          totalSize: file.length,
          downloadSpeed: 0,
          numPeers: t.numPeers,
          eta: null,
          error: typeof err === "string" ? err : err.message,
        });
        cleanup();
        return;
      }
      onUpdate({
        status: "done",
        progress: 1,
        downloaded: file.length,
        totalSize: file.length,
        downloadSpeed: 0,
        numPeers: t.numPeers,
        eta: 0,
        blob,
      });
    });

    t.on("error", (err: Error | string) => {
      onUpdate({
        status: "error",
        progress: 0,
        downloaded: 0,
        totalSize: t.length,
        downloadSpeed: 0,
        numPeers: t.numPeers,
        eta: null,
        error: typeof err === "string" ? err : err.message,
      });
      cleanup();
    });
  });

  return {
    abort: () => {
      aborted = true;
      cleanup();
    },
  };
}

export function destroyClient() {
  if (_client) {
    try {
      _client.destroy();
    } catch {}
    _client = null;
  }
}
