// LRU memory chunk store for webtorrent. Pieces are kept in RAM only; the
// oldest are evicted once `maxBytes` is exceeded so a single large stream
// can't blow up memory.

const queueMicrotask =
  global.queueMicrotask || ((cb) => Promise.resolve().then(cb));

const DEFAULT_CAP =
  parseInt(process.env.TORRENT_MEMORY_CAP_MB || "512", 10) * 1024 * 1024;

class BoundedMemoryStore {
  constructor(chunkLength, opts = {}) {
    this.chunkLength = Number(chunkLength);
    if (!this.chunkLength) throw new Error("chunkLength is required");
    this.length = Number(opts.length) || Infinity;
    this.maxBytes = Number(opts.maxBytes) || DEFAULT_CAP;

    this.chunks = new Map();
    this.bytes = 0;
    this.closed = false;

    if (this.length !== Infinity) {
      this.lastChunkLength =
        this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1;
    }
  }

  put(index, buf, cb = () => {}) {
    if (this.closed)
      return queueMicrotask(() => cb(new Error("Storage is closed")));

    const isLastChunk = index === this.lastChunkIndex;
    const expected = isLastChunk ? this.lastChunkLength : this.chunkLength;
    if (expected != null && buf.length !== expected) {
      return queueMicrotask(() =>
        cb(new Error(`Chunk length must be ${expected}, got ${buf.length}`)),
      );
    }

    if (this.chunks.has(index)) {
      this.bytes -= this.chunks.get(index).length;
      this.chunks.delete(index);
    }
    this.chunks.set(index, buf);
    this.bytes += buf.length;

    while (this.bytes > this.maxBytes && this.chunks.size > 1) {
      const oldest = this.chunks.keys().next().value;
      if (oldest === index) break;
      const evicted = this.chunks.get(oldest);
      this.chunks.delete(oldest);
      this.bytes -= evicted.length;
    }

    queueMicrotask(() => cb(null));
  }

  get(index, opts, cb) {
    if (typeof opts === "function") {
      cb = opts;
      opts = null;
    }
    cb = cb || (() => {});
    if (this.closed)
      return queueMicrotask(() => cb(new Error("Storage is closed")));

    const buf = this.chunks.get(index);
    if (!buf) {
      const err = new Error("Chunk not found");
      err.notFound = true;
      return queueMicrotask(() => cb(err));
    }

    // Touch — move to LRU tail.
    this.chunks.delete(index);
    this.chunks.set(index, buf);

    let out = buf;
    if (opts) {
      const offset = opts.offset || 0;
      const len = opts.length || buf.length - offset;
      if (offset !== 0 || len !== buf.length) {
        out = buf.slice(offset, len + offset);
      }
    }
    queueMicrotask(() => cb(null, out));
  }

  close(cb = () => {}) {
    if (this.closed)
      return queueMicrotask(() => cb(new Error("Storage is closed")));
    this.closed = true;
    this.chunks.clear();
    this.bytes = 0;
    queueMicrotask(() => cb(null));
  }

  destroy(cb) {
    this.close(cb);
  }
}

// Each torrent.add() should get a fresh factory; sharing across concurrent
// adds would have them step on each other's getInstance().
function createBoundedStoreFactory(maxBytes = DEFAULT_CAP) {
  let instance = null;
  function BoundedStoreFactory(chunkLength, opts) {
    instance = new BoundedMemoryStore(chunkLength, { ...opts, maxBytes });
    return instance;
  }
  BoundedStoreFactory.getInstance = () => instance;
  return BoundedStoreFactory;
}

module.exports = { BoundedMemoryStore, createBoundedStoreFactory, DEFAULT_CAP };
