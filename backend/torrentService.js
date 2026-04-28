// HTTPS first — they're TCP, don't churn dgram sockets, and resolve cleanly
// even when the host's UDP egress / DNS is flaky. UDP trackers as fallback.
const MINERVA_TRACKERS = [
  "https://tracker.gbitt.info:443/announce",
  "https://1337.abcvg.info:443/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://explodie.org:6969/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://opentracker.i2p.rocks:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://tracker.moeking.me:6969/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
  "udp://opentracker.io:6969/announce",
  "udp://new-line.net:6969/announce",
  "udp://moonburrow.club:6969/announce",
  "udp://bt1.archive.org:6969/announce",
  "udp://bt.ktrackers.com:6666/announce",
];

// Browsers can only reach wss:// trackers; the rest are server-only.
const BROWSER_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.files.fm:7073/announce",
];

const { createBoundedStoreFactory } = require("./boundedMemoryStore");

const TORRENT_IDLE_MS = parseInt(process.env.TORRENT_IDLE_MS || "5000", 10);
const MEMORY_CAP_MB = parseInt(process.env.TORRENT_MEMORY_CAP_MB || "256", 10);
const WARM_POOL_MAX = parseInt(process.env.TORRENT_WARM_POOL_MAX || "20", 10);

let _client = null;
let _clientReady = null;

const torrents = new Map();
const pendingAdds = new Map();

async function getClient() {
  if (_client) return _client;
  if (_clientReady) return _clientReady;

  _clientReady = (async () => {
    const mod = await import("webtorrent");
    const WebTorrent = mod.default || mod;
    _client = new WebTorrent({
      maxConns: parseInt(process.env.TORRENT_MAX_CONNS || "100", 10),
      // DHT and uTP open many native UDP sockets and were the source of
      // SIGSEGV crashes on the previous Alpine/musl build. We rely on the
      // tracker list in MINERVA_TRACKERS for peer discovery; HTTPS trackers
      // first, then UDP. Disable here to keep the surface small even on
      // glibc.
      dht: false,
      lsd: false,
      natUpnp: false,
      natPmp: false,
      utPex: true,
    });
    _client.on("error", (err) => {
      console.error("[torrent] client error:", err.message || err);
    });
    // Catch errors on every torrent the moment it's added — fired
    // synchronously inside client.add(), before metadata is parsed. This
    // ensures any 'error' event has a listener even if our caller's per-add
    // handler hasn't been attached yet.
    _client.on("add", (torrent) => {
      torrent.on("error", (err) => {
        console.error(
          `[torrent] ${torrent.infoHash?.slice(0, 8) || "?"} error:`,
          err?.message || err,
        );
      });
    });
    console.log(
      `[torrent] WebTorrent client initialized (RAM-only, cap=${MEMORY_CAP_MB}MB/torrent, warm pool max=${WARM_POOL_MAX})`,
    );
    return _client;
  })();

  return _clientReady;
}

function parseInfoHash(magnet) {
  if (!magnet) return null;
  const m = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
  if (!m) return null;
  return m[1].toLowerCase();
}

function withTrackers(magnet, { includeBrowserTrackers = false } = {}) {
  if (!magnet) return magnet;
  const trackers = includeBrowserTrackers
    ? [...MINERVA_TRACKERS, ...BROWSER_TRACKERS]
    : MINERVA_TRACKERS;
  const sep = magnet.includes("?") ? "&" : "?";
  const trParams = trackers
    .map((t) => "tr=" + encodeURIComponent(t))
    .join("&");
  return magnet + sep + trParams;
}

async function addOrGetTorrent(magnet) {
  const client = await getClient();
  const ih = parseInfoHash(magnet);

  if (ih) {
    const cached = torrents.get(ih);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.torrent;
    }
  }

  const pending = pendingAdds.get(magnet);
  if (pending) return pending;

  const factory = createBoundedStoreFactory(MEMORY_CAP_MB * 1024 * 1024);

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let t;
    try {
      t = client.add(
        withTrackers(magnet),
        { store: factory, deselect: true },
        (torrent) => {
          if (settled) return;
          settled = true;
          torrents.set(torrent.infoHash, {
            torrent,
            store: factory.getInstance(),
            state: "active",
            refCount: 0,
            fileSelections: new Set(),
            lastAccess: Date.now(),
            addedAt: Date.now(),
            transitionTimer: null,
          });
          try {
            torrent.deselect(0, torrent.pieces.length - 1, false);
          } catch (_) {}
          resolve(torrent);
        },
      );
      t.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
      t.on("warning", (w) =>
        console.warn("[torrent] warning:", w.message || w),
      );
    } catch (err) {
      settled = true;
      reject(err);
    }
  });

  pendingAdds.set(magnet, promise);
  promise.finally(() => pendingAdds.delete(magnet));
  return promise;
}

function pickFile(torrent, soId, filename) {
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

function destroyEntry(ih, reason) {
  const entry = torrents.get(ih);
  if (!entry) return;
  if (entry.transitionTimer) {
    clearTimeout(entry.transitionTimer);
    entry.transitionTimer = null;
  }
  try {
    entry.torrent.destroy({ destroyStore: true });
  } catch (_) {}
  torrents.delete(ih);
  console.log(`[torrent] released ${ih.slice(0, 8)}… (${reason})`);
}

function transitionToWarm(ih) {
  const entry = torrents.get(ih);
  if (!entry) return;
  if (entry.refCount > 0) return;
  for (const filePath of entry.fileSelections) {
    const file = entry.torrent.files.find((f) => f.path === filePath);
    if (file) {
      try {
        file.deselect();
      } catch (_) {}
    }
  }
  entry.fileSelections.clear();
  entry.state = "warm";
  entry.transitionTimer = null;
  enforceWarmPoolCap();
}

function enforceWarmPoolCap() {
  const warm = [];
  for (const [ih, entry] of torrents.entries()) {
    if (entry.state === "warm" && entry.refCount === 0) {
      warm.push([ih, entry.lastAccess]);
    }
  }
  if (warm.length <= WARM_POOL_MAX) return;
  warm.sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < warm.length - WARM_POOL_MAX; i++) {
    destroyEntry(warm[i][0], "warm pool LRU");
  }
}

function scheduleTransition(ih) {
  const entry = torrents.get(ih);
  if (!entry) return;
  if (entry.refCount > 0) return;
  if (entry.transitionTimer) return;
  entry.transitionTimer = setTimeout(
    () => transitionToWarm(ih),
    TORRENT_IDLE_MS,
  );
  if (typeof entry.transitionTimer.unref === "function") {
    entry.transitionTimer.unref();
  }
}

async function selectFile({ magnet, soId, filename }) {
  const torrent = await addOrGetTorrent(magnet);
  const file = pickFile(torrent, soId, filename);
  if (!file) {
    scheduleTransition(torrent.infoHash);
    throw new Error(
      `File not found in torrent (so_id=${soId}, name=${filename})`,
    );
  }
  const entry = torrents.get(torrent.infoHash);
  if (!entry) throw new Error("Torrent disappeared during selectFile");

  entry.lastAccess = Date.now();
  entry.refCount++;
  entry.state = "active";
  if (entry.transitionTimer) {
    clearTimeout(entry.transitionTimer);
    entry.transitionTimer = null;
  }
  if (!entry.fileSelections.has(file.path)) {
    file.select();
    entry.fileSelections.add(file.path);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const cur = torrents.get(torrent.infoHash);
    if (!cur) return;
    cur.refCount = Math.max(0, cur.refCount - 1);
    cur.lastAccess = Date.now();
    if (cur.refCount === 0) scheduleTransition(torrent.infoHash);
  };

  return { torrent, file, release };
}

async function warmTorrent(magnet) {
  try {
    const torrent = await addOrGetTorrent(magnet);
    const entry = torrents.get(torrent.infoHash);
    if (!entry) return true;
    entry.lastAccess = Date.now();
    if (entry.refCount === 0 && entry.state !== "warm") {
      transitionToWarm(torrent.infoHash);
    } else {
      enforceWarmPoolCap();
    }
    return true;
  } catch (err) {
    console.warn("[torrent] warm failed:", err.message || err);
    return false;
  }
}

async function getMetrics() {
  const client = await getClient();
  const items = Array.from(torrents.values()).map((entry) => {
    const t = entry.torrent;
    return {
      infoHash: t.infoHash,
      name: t.name || "(metadata pending)",
      magnetURI: t.magnetURI,
      state: entry.state,
      refCount: entry.refCount,
      ready: !!t.ready,
      progress: t.progress || 0,
      length: t.length || 0,
      downloaded: t.downloaded || 0,
      uploaded: t.uploaded || 0,
      ratio: t.ratio || 0,
      downloadSpeed: t.downloadSpeed || 0,
      uploadSpeed: t.uploadSpeed || 0,
      numPeers: t.numPeers || 0,
      bytesInRam: entry.store?.bytes || 0,
      filesCount: t.files?.length || 0,
      lastAccess: entry.lastAccess,
      addedAt: entry.addedAt,
      uptimeMs: Date.now() - entry.addedAt,
    };
  });

  const totalBytesInRam = items.reduce((a, b) => a + b.bytesInRam, 0);
  return {
    summary: {
      torrentsLoaded: items.length,
      activeStreams: items.filter((i) => i.state === "active").length,
      warmTorrents: items.filter((i) => i.state === "warm").length,
      totalPeers: items.reduce((a, b) => a + b.numPeers, 0),
      downloadSpeed: client.downloadSpeed || 0,
      uploadSpeed: client.uploadSpeed || 0,
      totalDownloaded: client.downloaded || 0,
      totalUploaded: client.uploaded || 0,
      ratio: client.ratio || 0,
      bytesInRam: totalBytesInRam,
      memoryCapMB: MEMORY_CAP_MB,
      warmPoolMax: WARM_POOL_MAX,
      idleMs: TORRENT_IDLE_MS,
    },
    torrents: items,
  };
}

function getStatus() {
  return Array.from(torrents.values()).map((entry) => ({
    infoHash: entry.torrent.infoHash,
    name: entry.torrent.name,
    state: entry.state,
    progress: entry.torrent.progress,
    downloaded: entry.torrent.downloaded,
    downloadSpeed: entry.torrent.downloadSpeed,
    uploadSpeed: entry.torrent.uploadSpeed,
    numPeers: entry.torrent.numPeers,
    files: entry.torrent.files.length,
    activeStreams: entry.refCount,
    bytesInRam: entry.store?.bytes || 0,
    lastAccess: entry.lastAccess,
  }));
}

function getFileStatus({ magnet, soId, filename }) {
  const ih = parseInfoHash(magnet);
  const cached = ih ? torrents.get(ih) : null;
  const pending = pendingAdds.has(magnet);

  if (!cached) {
    return {
      loaded: false,
      pending,
      ready: false,
      numPeers: 0,
      downloadSpeed: 0,
      progress: 0,
      downloaded: 0,
      totalSize: 0,
      fileFound: false,
    };
  }

  const { torrent } = cached;
  const file = pickFile(torrent, soId, filename);
  return {
    loaded: true,
    pending: false,
    ready: !!torrent.ready,
    state: cached.state,
    name: torrent.name,
    numPeers: torrent.numPeers,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    progress: file ? file.progress : torrent.progress,
    downloaded: file
      ? Math.floor((file.progress || 0) * file.length)
      : torrent.downloaded,
    totalSize: file ? file.length : torrent.length,
    fileFound: !!file,
  };
}

module.exports = {
  getClient,
  selectFile,
  warmTorrent,
  getStatus,
  getMetrics,
  getFileStatus,
  MINERVA_TRACKERS,
  withTrackers,
  parseInfoHash,
};
