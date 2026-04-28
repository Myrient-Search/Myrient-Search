const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const fs = require("fs");
const https = require("https");
const http = require("http");
const axios = require("axios");
const Database = require("better-sqlite3");
const { pool, query, initDb } = require("./db");
const { getMeiliClient, initMeili, INDEX_NAME } = require("./meili");
const nonGameTermsData = require("./data/nonGameTerms.json");
const nonGameTerms = nonGameTermsData.terms.map((t) => t.toLowerCase());
const catList = require("./data/categories.json");

const MINERVA_HOST = process.env.MINERVA_HOST || "https://minerva-archive.org";
const HASHES_DB_URL = `${MINERVA_HOST}/assets/hashes.db`;
const CACHE_DIR = process.env.MINERVA_CACHE_DIR || "/tmp/minerva-cache";
const HASHES_DB_PATH = path.join(CACHE_DIR, "hashes.db");
const HASHES_DB_META_PATH = path.join(CACHE_DIR, "hashes.db.meta.json");

function findCategory(str, catList) {
  let lowerStr = str.toLowerCase();
  let foundCat = "";
  let catLength = 0;
  let foundSubCat = "";
  let subCatLength = 0;
  for (let cat in catList.Categories) {
    if (lowerStr.includes(cat.toLowerCase())) {
      if (cat.length > catLength) {
        foundCat = cat;
        catLength = cat.length;
      }
    }
  }
  if (foundCat) {
    for (let subCat in catList.Categories[foundCat]) {
      let subCatString = catList.Categories[foundCat][subCat];
      if (lowerStr.includes(subCatString.toLowerCase())) {
        if (subCatString.length > subCatLength) {
          foundSubCat = subCatString;
          subCatLength = subCatString.length;
        }
      }
    }
  } else {
    for (let cat in catList.Categories["Others"]) {
      let catString = catList.Categories["Others"][cat];
      if (lowerStr.includes(catString.toLowerCase())) {
        if (catString.length > catLength) {
          foundCat = catString;
          catLength = catString.length;
        }
      }
    }
    if (!foundCat) {
      foundCat = "Others";
    }
  }
  for (let cat in catList.Special) {
    let specialString = catList.Special[cat];
    if (foundCat == cat) foundCat = specialString;
    if (foundSubCat == cat) foundSubCat = specialString;
  }
  if (foundSubCat.includes(foundCat)) foundCat = "";
  return { cat: foundCat, subCat: foundSubCat };
}

function isGameForIGDB(filename) {
  if (!filename) return false;
  const lowerFileName = filename.toLowerCase();
  return !nonGameTerms.some((term) => {
    if (lowerFileName.endsWith(`.${term}`)) return true;
    if (
      lowerFileName.includes(`(${term})`) ||
      lowerFileName.includes(`[${term}]`)
    )
      return true;
    if (lowerFileName.endsWith(` ${term}`)) return true;
    return false;
  });
}

const DB_BATCH_SIZE = 500;
const MEILI_BATCH_SIZE = 100;
const IGDB_BATCH_SIZE = 10;
const IGDB_WORKERS = 4;
const IGDB_WORKER_DELAY = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const ax = axios.create({ httpAgent, httpsAgent, timeout: 600_000 });

const pipelineState = {
  status: "idle",
  mode: null,
  startedAt: null,
  endedAt: null,
  scrapeTotal: 0,
  scrapeNew: 0,
  queueSize: 0,
  enriched: 0,
  indexed: 0,
  scrapeComplete: false,
  cancelled: false,
  logs: [],
};

function log(msg) {
  const entry = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  pipelineState.logs.push(entry);
  if (pipelineState.logs.length > 1000) pipelineState.logs.shift();
  console.log("[pipeline]", msg);
}

function resetState(mode) {
  Object.assign(pipelineState, {
    status: "running",
    mode,
    startedAt: new Date().toISOString(),
    endedAt: null,
    scrapeTotal: 0,
    scrapeNew: 0,
    queueSize: 0,
    enriched: 0,
    indexed: 0,
    scrapeComplete: false,
    cancelled: false,
    logs: [],
  });
}

const REGIONS = new Set([
  "usa", "japan", "europe", "world", "asia", "australia", "brazil",
  "canada", "china", "denmark", "finland", "france", "germany", "greece",
  "hong kong", "israel", "italy", "korea", "netherlands", "norway",
  "poland", "portugal", "russia", "spain", "sweden", "taiwan", "uk",
  "united kingdom",
]);

function parseFilename(filename) {
  const nameNoExt = path.parse(filename).name;
  const base_name = nameNoExt.split(/\s*\(|\[/, 1)[0].trim();
  const tags = [];
  let region = "";
  const tagRegex = /[\[(](.*?)[\])]/g;
  let m;
  while ((m = tagRegex.exec(nameNoExt)) !== null) {
    const tag = m[1].trim();
    tags.push(tag);
    if (!region) {
      const parts = tag.split(/[,+]/).map((s) => s.trim().toLowerCase());
      if (parts.filter((p) => REGIONS.has(p)).length / parts.length >= 0.5)
        region = tag;
    }
  }
  return { base_name, tags, region };
}

function parsePath(fullPath) {
  const trimmed = fullPath.replace(/^\.\//, "");
  const segments = trimmed.split("/");
  const filename = segments.pop() || trimmed;
  const group = segments[0] || "";
  // Skip tag-like folders ("!EXTRAS", "[BIOS]") when picking the platform.
  let platformRaw = segments[1] || group;
  for (let i = 1; i < segments.length; i++) {
    if (!segments[i].startsWith("!") && !segments[i].startsWith("[")) {
      platformRaw = segments[i];
      break;
    }
  }
  let platform = platformRaw;
  const platformMatch = findCategory(platformRaw, catList);
  if (platformMatch.cat && platformMatch.subCat) {
    platform = `${platformMatch.cat} - ${platformMatch.subCat}`;
  } else if (platformMatch.subCat) {
    platform = platformMatch.subCat;
  } else if (platformMatch.cat) {
    platform = platformMatch.cat;
  }
  return { filename, group, platform };
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function ensureHashesDb() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let prevMeta = null;
  try {
    prevMeta = JSON.parse(fs.readFileSync(HASHES_DB_META_PATH, "utf8"));
  } catch {}

  let headRes;
  try {
    headRes = await ax.head(HASHES_DB_URL, { timeout: 30_000 });
  } catch (err) {
    log(`[hashes] HEAD failed (${err.message}) — using cached copy if any`);
    if (fs.existsSync(HASHES_DB_PATH)) return HASHES_DB_PATH;
    throw err;
  }

  const upstreamMeta = {
    etag: headRes.headers["etag"] || null,
    lastModified: headRes.headers["last-modified"] || null,
    contentLength: parseInt(headRes.headers["content-length"] || "0", 10),
  };

  if (
    fs.existsSync(HASHES_DB_PATH) &&
    prevMeta &&
    prevMeta.etag === upstreamMeta.etag &&
    prevMeta.lastModified === upstreamMeta.lastModified &&
    prevMeta.contentLength === upstreamMeta.contentLength
  ) {
    log(
      `[hashes] cached copy is current (${formatBytes(upstreamMeta.contentLength)})`,
    );
    return HASHES_DB_PATH;
  }

  log(
    `[hashes] downloading ${HASHES_DB_URL} (${formatBytes(upstreamMeta.contentLength)})`,
  );
  const tmpPath = HASHES_DB_PATH + ".part";
  const writer = fs.createWriteStream(tmpPath);
  const res = await ax.get(HASHES_DB_URL, { responseType: "stream" });

  let downloaded = 0;
  let lastReport = Date.now();
  res.data.on("data", (chunk) => {
    downloaded += chunk.length;
    if (pipelineState.cancelled) {
      res.data.destroy();
      writer.destroy();
      return;
    }
    if (Date.now() - lastReport > 5000 && upstreamMeta.contentLength) {
      const pct = ((downloaded / upstreamMeta.contentLength) * 100).toFixed(1);
      log(
        `[hashes] ${pct}% (${formatBytes(downloaded)} / ${formatBytes(upstreamMeta.contentLength)})`,
      );
      lastReport = Date.now();
    }
  });

  await new Promise((resolve, reject) => {
    res.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    res.data.on("error", reject);
  });

  if (pipelineState.cancelled) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw new Error("Cancelled during hashes.db download");
  }

  fs.renameSync(tmpPath, HASHES_DB_PATH);
  fs.writeFileSync(HASHES_DB_META_PATH, JSON.stringify(upstreamMeta, null, 2));
  log(`[hashes] saved to ${HASHES_DB_PATH}`);
  return HASHES_DB_PATH;
}

const UPSERT_COLS = [
  "game_name", "filename", "full_path", "platform", "group_name", "region",
  "size", "size_bytes", "magnet", "torrent_file", "so_id", "md5", "sha1",
  "sha256", "crc32", "tags",
];

async function batchUpsert(games) {
  if (games.length === 0) return [];
  const values = [];
  const placeholders = games.map((g, idx) => {
    const b = idx * UPSERT_COLS.length;
    values.push(
      g.game_name, g.filename, g.full_path, g.platform, g.group_name, g.region,
      g.size, g.size_bytes, g.magnet, g.torrent_file, g.so_id, g.md5, g.sha1,
      g.sha256, g.crc32, g.tags,
    );
    const params = UPSERT_COLS.map((_, i) => {
      const ph = `$${b + i + 1}`;
      if (UPSERT_COLS[i] === "tags") return `${ph}::TEXT[]`;
      return ph;
    });
    return `(${params.join(",")})`;
  });
  const updateSet = UPSERT_COLS
    .filter((c) => c !== "full_path")
    .map((c) => `${c}=EXCLUDED.${c}`)
    .join(", ");
  const { rows } = await query(
    `INSERT INTO games (${UPSERT_COLS.join(",")})
     VALUES ${placeholders.join(",")}
     ON CONFLICT (full_path) DO UPDATE SET ${updateSet}
     RETURNING id, game_name, description, filename`,
    values,
  );
  return rows;
}

async function batchIndexGames(rows) {
  if (!rows.length) return;
  try {
    const docs = rows.map((r) => ({
      id: r.id,
      game_name: r.game_name,
      filename: r.filename,
      full_path: r.full_path,
      platform: r.platform,
      group_name: r.group_name,
      region: r.region,
      size: r.size,
      size_bytes: r.size_bytes != null ? Number(r.size_bytes) : 0,
      magnet: r.magnet || "",
      torrent_file: r.torrent_file || "",
      so_id: r.so_id != null ? r.so_id : null,
      tags: r.tags,
      description: r.description || null,
      rating: r.rating != null ? parseFloat(r.rating) : null,
      release_date: r.release_date
        ? r.release_date instanceof Date
          ? r.release_date.toISOString().split("T")[0]
          : r.release_date
        : null,
      developer: r.developer || null,
      publisher: r.publisher || null,
      genre: r.genre || null,
      images: r.images || [],
      is_non_game: !isGameForIGDB(r.filename),
    }));
    await getMeiliClient()
      .index(INDEX_NAME)
      .addDocuments(docs, { primaryKey: "id" });
    pipelineState.indexed += docs.length;
  } catch (err) {
    log(`[index] WARN ${err.message}`);
  }
}

async function getIGDBToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!data.access_token)
    throw new Error("No IGDB token: " + JSON.stringify(data));
  return data.access_token;
}

const IGDB_FIELDS =
  "name,summary,rating,first_release_date,involved_companies.company.name,genres.name,cover.url,screenshots.url";

async function igdbBatch(token, games) {
  const body = games
    .map(
      (g, i) =>
        `query games "q_${i}" { fields ${IGDB_FIELDS}; where name ~ "${g.game_name.replace(/"/g, '\\"')}"*; sort rating_count desc; limit 1; };`,
    )
    .join("\n");
  try {
    const res = await fetch("https://api.igdb.com/v4/multiquery", {
      method: "POST",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
    });
    return await res.json();
  } catch {
    return [];
  }
}

function extractIGDB(d) {
  const u = {};
  if (d.summary) u.description = d.summary;
  if (d.rating != null) u.rating = +(d.rating / 20).toFixed(2);
  if (d.first_release_date)
    u.release_date = new Date(d.first_release_date * 1000)
      .toISOString()
      .split("T")[0];
  if (d.involved_companies?.length)
    u.developer = u.publisher = d.involved_companies[0].company.name;
  if (d.genres?.length) u.genre = d.genres.map((g) => g.name).join(", ");
  const fix = (u) =>
    (u?.startsWith("//") ? "https:" + u : u)?.replace("t_thumb", "t_1080p");
  const imgs = [];
  if (d.cover?.url) imgs.push(fix(d.cover.url));
  d.screenshots?.slice(0, 3).forEach((s) => imgs.push(fix(s.url)));
  if (imgs.length) u.images = imgs;
  return u;
}

async function enrichWorker(enrichQueue, token, workerDelay) {
  await sleep(workerDelay);
  while (!pipelineState.cancelled) {
    if (!pipelineState.scrapeComplete && enrichQueue.length < IGDB_BATCH_SIZE) {
      await sleep(100);
      continue;
    }
    if (enrichQueue.length === 0) {
      if (pipelineState.scrapeComplete) break;
      await sleep(100);
      continue;
    }

    const batch = enrichQueue.splice(0, IGDB_BATCH_SIZE);
    pipelineState.queueSize = enrichQueue.length;

    const raw = await igdbBatch(token, batch);
    const resultMap = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const idx = parseInt((item.name || "").replace("q_", ""));
        if (!isNaN(idx) && item.result?.length) resultMap[idx] = item.result[0];
      }
    }

    const updatedRows = await Promise.all(
      batch.map(async (game, i) => {
        const igdbHit = resultMap[i];
        const upd = igdbHit ? extractIGDB(igdbHit) : {};
        upd.description = upd.description || "";

        const sets = [];
        const params = [];
        let pi = 1;
        for (const [k, v] of Object.entries(upd)) {
          if (k === "images") {
            sets.push(`images=$${pi++}::TEXT[]`);
            params.push(v);
          } else {
            sets.push(`${k}=$${pi++}`);
            params.push(v);
          }
        }
        if (!sets.length) return null;
        params.push(game.id);
        const { rows } = await query(
          `UPDATE games SET ${sets.join(",")} WHERE id=$${pi} RETURNING *`,
          params,
        ).catch(() => ({ rows: [] }));
        pipelineState.enriched++;
        if (igdbHit) log(`✓ ${game.game_name}`);
        return rows[0] || null;
      }),
    );

    await batchIndexGames(updatedRows.filter(Boolean));
    await sleep(IGDB_WORKER_DELAY);
  }
}

async function ingest({ mode, enrichQueue }) {
  const dbPath = await ensureHashesDb();
  log(`[hashes] opening SQLite database at ${dbPath}`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma("journal_mode = OFF");
  db.pragma("temp_store = MEMORY");

  const totalRow = db.prepare("SELECT COUNT(*) AS n FROM files").get();
  const totalFiles = totalRow?.n || 0;
  log(`[hashes] ${totalFiles.toLocaleString()} files in catalog`);

  const seenPaths = new Set();
  const buffer = [];

  async function flushBuffer(force = false) {
    while (buffer.length >= (force ? 1 : DB_BATCH_SIZE)) {
      if (pipelineState.cancelled) return;
      const chunk = buffer.splice(0, DB_BATCH_SIZE);
      const rows = await batchUpsert(chunk).catch((err) => {
        log(`DB batch error: ${err.message}`);
        return [];
      });
      pipelineState.scrapeNew += rows.length;

      const toEnrich = [];
      const alreadyEnrichedIds = [];
      for (const row of rows) {
        if (
          (mode === "clean" || !row.description) &&
          isGameForIGDB(row.filename)
        )
          toEnrich.push({ id: row.id, game_name: row.game_name });
        else alreadyEnrichedIds.push(row.id);
      }
      for (const g of toEnrich) {
        enrichQueue.push(g);
        pipelineState.queueSize = enrichQueue.length;
      }
      if (alreadyEnrichedIds.length) {
        const { rows: full } = await query(
          "SELECT * FROM games WHERE id = ANY($1::INT[])",
          [alreadyEnrichedIds],
        ).catch(() => ({ rows: [] }));
        if (full.length) await batchIndexGames(full);
      }
    }
  }

  const stmt = db.prepare(
    "SELECT id, full_path, file_name, size, md5, sha1, sha256, crc32, torrents, so_id, magnet FROM files",
  );

  let processed = 0;
  let lastReport = Date.now();
  for (const r of stmt.iterate()) {
    if (pipelineState.cancelled) break;
    if (!r.full_path) continue;

    seenPaths.add(r.full_path);
    const { filename, group, platform } = parsePath(r.full_path);
    const realFilename = r.file_name || filename;
    const { base_name, tags, region } = parseFilename(realFilename);
    const sizeBytes = Number(r.size || 0);

    buffer.push({
      game_name: base_name,
      filename: realFilename,
      full_path: r.full_path,
      platform,
      group_name: group,
      region,
      size: formatBytes(sizeBytes),
      size_bytes: sizeBytes,
      magnet: r.magnet || "",
      torrent_file: r.torrents || "",
      so_id: r.so_id != null ? Number(r.so_id) : null,
      md5: r.md5 || null,
      sha1: r.sha1 || null,
      sha256: r.sha256 || null,
      crc32: r.crc32 || null,
      tags,
    });
    pipelineState.scrapeTotal++;
    processed++;

    if (buffer.length >= DB_BATCH_SIZE) await flushBuffer();

    if (Date.now() - lastReport > 5000) {
      log(
        `[ingest] ${processed.toLocaleString()} / ${totalFiles.toLocaleString()} (${(
          (processed / totalFiles) *
          100
        ).toFixed(1)}%)`,
      );
      lastReport = Date.now();
    }
  }

  await flushBuffer(true);
  db.close();

  log(
    `[ingest] ✓ ${pipelineState.scrapeTotal} total | ${pipelineState.scrapeNew} new/updated | queue ${enrichQueue.length}`,
  );

  if (mode === "incremental" && seenPaths.size > 0 && !pipelineState.cancelled) {
    const { rows } = await query("SELECT full_path FROM games");
    const stale = rows
      .map((r) => r.full_path)
      .filter((p) => !seenPaths.has(p));
    if (stale.length) {
      // Postgres parameter cap — chunk the IN list.
      const CHUNK = 5000;
      for (let i = 0; i < stale.length; i += CHUNK) {
        await query(
          "DELETE FROM games WHERE full_path = ANY($1::TEXT[])",
          [stale.slice(i, i + CHUNK)],
        );
      }
      log(`[ingest] Pruned ${stale.length} stale entries.`);
    }
  }

  pipelineState.scrapeComplete = true;
}

async function runPipeline({ mode = "incremental" } = {}) {
  if (pipelineState.status === "running")
    throw new Error("Pipeline already running");
  resetState(mode);
  log(`▶ Pipeline start (mode=${mode})`);

  await initDb().catch((e) => log(`initDb warn: ${e.message}`));
  await initMeili().catch((e) => log(`initMeili warn: ${e.message}`));

  if (mode === "clean") {
    log("[clean] Wiping Meilisearch index...");
    await getMeiliClient()
      .index(INDEX_NAME)
      .deleteAllDocuments()
      .catch(() => {});
    log("[clean] Wiping games table...");
    await query("DELETE FROM games").catch(() => {});
  }

  const enrichQueue = [];

  let igdbToken = null;
  try {
    igdbToken = await getIGDBToken();
    log("[igdb] ✓ Authenticated");
  } catch (err) {
    log(`[igdb] WARN: ${err.message} — enrichment disabled`);
  }

  const workers = igdbToken
    ? Array.from({ length: IGDB_WORKERS }, (_, i) =>
        enrichWorker(
          enrichQueue,
          igdbToken,
          i * (IGDB_WORKER_DELAY / IGDB_WORKERS),
        ),
      )
    : [
        Promise.resolve().then(() => {
          pipelineState.scrapeComplete = true;
        }),
      ];

  try {
    await Promise.all([ingest({ mode, enrichQueue }), ...workers]);
    pipelineState.status = pipelineState.cancelled ? "idle" : "done";
    pipelineState.endedAt = new Date().toISOString();
    log(
      pipelineState.cancelled
        ? "⏹ Pipeline stopped by user."
        : `✓ Done. Ingested ${pipelineState.scrapeTotal} | Enriched ${pipelineState.enriched} | Indexed ${pipelineState.indexed}`,
    );
  } catch (err) {
    pipelineState.status = "error";
    pipelineState.endedAt = new Date().toISOString();
    log(`✗ Pipeline error: ${err.message}`);
    throw err;
  }
}

function stopPipeline() {
  if (pipelineState.status === "running") {
    pipelineState.cancelled = true;
    log("⏹ Stop requested...");
  }
}

module.exports = { runPipeline, stopPipeline, pipelineState };
