/**
 * pipeline.js — Unified high-performance scrape + enrich + index pipeline.
 *
 * Key perf features:
 *  • 20 parallel HTTP crawlers (Promise pool) — main throughput win
 *  • 500-game batched DB upserts with RETURNING id — no per-game round trips
 *  • 4 parallel IGDB enrich workers (saturates 4 r/s limit)
 *  • 100-doc batched Meilisearch addDocuments per enrich batch
 *  • HTTP keep-alive agent — reuse TCP connections to Myrient
 *  • Stop support via pipelineState.cancelled flag
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const http = require("http");
const https = require("https");
const axios = require("axios");
const cheerio = require("cheerio");
const { pool, query, initDb } = require("./db");
const { getMeiliClient, initMeili, INDEX_NAME } = require("./meili");
const nonGameTermsData = require("./data/nonGameTerms.json");
const nonGameTerms = nonGameTermsData.terms.map((t) => t.toLowerCase());

function isGameForIGDB(filename) {
  if (!filename) return false;
  const lowerFileName = filename.toLowerCase();
  return !nonGameTerms.some((term) => {
    // Treat as non-game if the term is the extension
    if (lowerFileName.endsWith(`.${term}`)) return true;
    // Or if it appears in metadata tags like (Manual) or [Update]
    if (
      lowerFileName.includes(`(${term})`) ||
      lowerFileName.includes(`[${term}]`)
    )
      return true;
    // Or if the filename ends with " term"
    if (lowerFileName.endsWith(` ${term}`)) return true;
    return false;
  });
}

// ── Tuning constants ──────────────────────────────────────────────────────────
const MYRIENT_URL = "https://myrient.erista.me/files/";
const CRAWL_CONCURRENCY = 20; // parallel HTTP fetches to Myrient
const DB_BATCH_SIZE = 500; // games per batch INSERT
const MEILI_BATCH_SIZE = 100; // docs per Meilisearch addDocuments call
const IGDB_BATCH_SIZE = 10; // games per IGDB multiquery
const IGDB_WORKERS = 4; // parallel IGDB workers (saturates 4 r/s)
const IGDB_WORKER_DELAY = 1000; // ms per worker between requests (4×1000=4r/s total)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Keep-alive HTTP agent — reuse TCP connections ─────────────────────────────
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: CRAWL_CONCURRENCY + 5,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: CRAWL_CONCURRENCY + 5,
});
const ax = axios.create({ httpAgent, httpsAgent, timeout: 30_000 });

// ── Global pipeline state (exported for admin polling) ────────────────────────
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

// ── Filename parser ───────────────────────────────────────────────────────────
const REGIONS = new Set([
  "usa",
  "japan",
  "europe",
  "world",
  "asia",
  "australia",
  "brazil",
  "canada",
  "china",
  "denmark",
  "finland",
  "france",
  "germany",
  "greece",
  "hong kong",
  "israel",
  "italy",
  "korea",
  "netherlands",
  "norway",
  "poland",
  "portugal",
  "russia",
  "spain",
  "sweden",
  "taiwan",
  "uk",
  "united kingdom",
]);
const LANGS = new Set([
  "en",
  "ja",
  "fr",
  "de",
  "es",
  "it",
  "nl",
  "pt",
  "sv",
  "no",
  "da",
  "fi",
  "zh",
  "ko",
  "pl",
  "ru",
  "he",
  "ca",
  "ar",
  "tr",
  "zh-hant",
  "zh-hans",
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

// ── Batch DB upsert — returns rows with {id, game_name, description} ──────────
async function batchUpsert(games) {
  if (games.length === 0) return [];
  const values = [];
  const placeholders = games.map((g, idx) => {
    const b = idx * 8;
    values.push(
      g.game_name,
      g.filename,
      g.platform,
      g.group_name,
      g.region,
      g.size,
      g.download_url,
      g.tags,
    );
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}::TEXT[])`;
  });
  const { rows } = await query(
    `INSERT INTO games (game_name,filename,platform,group_name,region,size,download_url,tags)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (download_url) DO UPDATE SET
       game_name=EXCLUDED.game_name, platform=EXCLUDED.platform, group_name=EXCLUDED.group_name,
       region=EXCLUDED.region, size=EXCLUDED.size, tags=EXCLUDED.tags
     RETURNING id, game_name, description, filename`,
    values,
  );
  return rows;
}

// ── Batch Meilisearch index ───────────────────────────────────────────────────
async function batchIndexGames(rows) {
  if (!rows.length) return;
  try {
    const docs = rows.map((r) => ({
      id: r.id,
      game_name: r.game_name,
      filename: r.filename,
      platform: r.platform,
      group_name: r.group_name,
      region: r.region,
      size: r.size,
      download_url: r.download_url,
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
    }));
    await getMeiliClient()
      .index(INDEX_NAME)
      .addDocuments(docs, { primaryKey: "id" });
    pipelineState.indexed += docs.length;
  } catch (err) {
    log(`[index] WARN ${err.message}`);
  }
}

// ── IGDB helpers ──────────────────────────────────────────────────────────────
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

// ── Enrich worker — one of IGDB_WORKERS running concurrently ─────────────────
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

    // Single IGDB call for the whole batch
    const raw = await igdbBatch(token, batch);
    const resultMap = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const idx = parseInt((item.name || "").replace("q_", ""));
        if (!isNaN(idx) && item.result?.length) resultMap[idx] = item.result[0];
      }
    }

    // Parallel DB updates — use RETURNING * to avoid a second SELECT per game
    const updatedRows = await Promise.all(
      batch.map(async (game, i) => {
        const igdbHit = resultMap[i];
        const upd = igdbHit ? extractIGDB(igdbHit) : {};
        upd.description = upd.description || ""; // mark enriched even on miss

        const sets = [],
          params = [];
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

    // Single batched Meilisearch call for the whole IGDB batch
    await batchIndexGames(updatedRows.filter(Boolean));
    await sleep(IGDB_WORKER_DELAY);
  }
}

// ── High-performance parallel crawler ────────────────────────────────────────
async function crawl({ mode, enrichQueue }) {
  const visited = new Set();
  const urlQueue = [MYRIENT_URL];
  const running = new Set();
  const gameBuffer = [];
  const seenUrls = new Set();

  // Flush buffer → batch DB insert → push IDs to enrich queue
  async function flushBuffer(force = false) {
    while (gameBuffer.length >= (force ? 1 : DB_BATCH_SIZE)) {
      const chunk = gameBuffer.splice(0, DB_BATCH_SIZE);
      const rows = await batchUpsert(chunk).catch((err) => {
        log(`DB batch error: ${err.message}`);
        return [];
      });
      pipelineState.scrapeNew += rows.length;

      const toEnrich = [];
      const alreadyEnrichedIds = [];
      for (const row of rows) {
        // Only enrich if it's missing description AND it appears to be an actual game
        if (
          (mode === "clean" || !row.description) &&
          isGameForIGDB(row.filename)
        )
          toEnrich.push({ id: row.id, game_name: row.game_name });
        else alreadyEnrichedIds.push(row.id);
      }
      // Push new games to enrich queue
      for (const g of toEnrich) {
        enrichQueue.push(g);
        pipelineState.queueSize = enrichQueue.length;
      }

      // Re-index already-enriched games in one batch SELECT + one Meilisearch call
      if (alreadyEnrichedIds.length) {
        const { rows: full } = await query(
          "SELECT * FROM games WHERE id = ANY($1::INT[])",
          [alreadyEnrichedIds],
        ).catch(() => ({ rows: [] }));
        if (full.length) await batchIndexGames(full);
      }
    }
  }

  // Process a single directory/page
  async function processUrl(url) {
    if (pipelineState.cancelled) return;
    try {
      const { data: html } = await ax.get(url);
      const $ = cheerio.load(html);
      const pathSegs = new URL(url).pathname
        .split("/")
        .filter((p) => p && p !== "files");
      const group = pathSegs[0] ? decodeURIComponent(pathSegs[0]) : "";
      const platform = pathSegs[1] ? decodeURIComponent(pathSegs[1]) : group;

      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (
          !href ||
          href.startsWith("?") ||
          /^[a-z]+:/.test(href) ||
          href.startsWith("/") ||
          href.includes("..") ||
          href === "./"
        )
          return;
        const absUrl = new URL(href, url).toString();
        if (href.endsWith("/")) {
          if (!visited.has(absUrl)) urlQueue.push(absUrl);
        } else {
          const filename = decodeURIComponent(href);
          const { base_name, tags, region } = parseFilename(filename);
          const size = $(el).closest("tr").find("td.size").text().trim();
          seenUrls.add(absUrl);
          pipelineState.scrapeTotal++;
          gameBuffer.push({
            game_name: base_name,
            filename,
            platform,
            group_name: group,
            region,
            size: size && size !== "-" ? size : "",
            download_url: absUrl,
            tags,
          });
        }
      });

      // Flush if buffer is large enough (non-blocking — fire and forget within event loop)
      if (gameBuffer.length >= DB_BATCH_SIZE) await flushBuffer();
    } catch (err) {
      if (!pipelineState.cancelled)
        log(`ERR ${url.slice(0, 80)}: ${err.message}`);
    }
  }

  // Promise-pool crawler: keep CRAWL_CONCURRENCY tasks running at all times
  while (
    (urlQueue.length > 0 || running.size > 0) &&
    !pipelineState.cancelled
  ) {
    while (urlQueue.length > 0 && running.size < CRAWL_CONCURRENCY) {
      const url = urlQueue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      const p = processUrl(url).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size > 0) await Promise.race([...running]);
  }

  // Final flush
  await flushBuffer(true);
  log(
    `[scrape] ✓ ${pipelineState.scrapeTotal} total | ${pipelineState.scrapeNew} new/updated | queue ${enrichQueue.length}`,
  );

  // Remove stale URLs in incremental mode
  if (mode === "incremental" && seenUrls.size > 0 && !pipelineState.cancelled) {
    const { rows } = await query("SELECT download_url FROM games");
    const stale = rows
      .map((r) => r.download_url)
      .filter((u) => !seenUrls.has(u));
    if (stale.length) {
      await query("DELETE FROM games WHERE download_url = ANY($1::TEXT[])", [
        stale,
      ]);
      log(`[scrape] Pruned ${stale.length} stale entries.`);
    }
  }

  pipelineState.scrapeComplete = true;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
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

  // Launch enrich workers (staggered) + crawler concurrently
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
    await Promise.all([crawl({ mode, enrichQueue }), ...workers]);
    pipelineState.status = pipelineState.cancelled ? "idle" : "done";
    pipelineState.endedAt = new Date().toISOString();
    log(
      pipelineState.cancelled
        ? "⏹ Pipeline stopped by user."
        : `✓ Done. Scraped ${pipelineState.scrapeTotal} | Enriched ${pipelineState.enriched} | Indexed ${pipelineState.indexed}`,
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
