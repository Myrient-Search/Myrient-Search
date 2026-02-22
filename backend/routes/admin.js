const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { getMeiliClient, INDEX_NAME } = require("../meili");
const { runPipeline, stopPipeline, pipelineState } = require("../pipeline");
const scheduler = require("../scheduler");

// ── Public: is admin enabled? ─────────────────────────────────────────────────
router.get("/ping", (req, res) => {
  res.json({ enabled: !!process.env.ADMIN_KEY });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!process.env.ADMIN_KEY)
    return res
      .status(503)
      .json({ enabled: false, error: "ADMIN_KEY not set." });
  if (key !== process.env.ADMIN_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}
router.use(requireAdmin);

// ── Status ────────────────────────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  const result = { postgres: {}, meilisearch: {} };
  try {
    const t0 = Date.now();
    const { rows } = await pool.query("SELECT COUNT(*) FROM games");
    result.postgres = {
      connected: true,
      latencyMs: Date.now() - t0,
      gameCount: parseInt(rows[0].count),
    };
  } catch (err) {
    result.postgres = { connected: false, error: err.message };
  }
  try {
    const t0 = Date.now();
    const stats = await getMeiliClient().index(INDEX_NAME).getStats();
    result.meilisearch = {
      connected: true,
      latencyMs: Date.now() - t0,
      documentCount: stats.numberOfDocuments,
      isIndexing: stats.isIndexing,
    };
  } catch (err) {
    result.meilisearch = { connected: false, error: err.message };
  }
  res.json(result);
});

// ── Pipeline state + queue ────────────────────────────────────────────────────
router.get("/pipeline", (req, res) => {
  res.json({
    status: pipelineState.status,
    mode: pipelineState.mode,
    startedAt: pipelineState.startedAt,
    endedAt: pipelineState.endedAt,
    scrapeTotal: pipelineState.scrapeTotal,
    scrapeNew: pipelineState.scrapeNew,
    queueSize: pipelineState.queueSize,
    enriched: pipelineState.enriched,
    indexed: pipelineState.indexed,
    scrapeComplete: pipelineState.scrapeComplete,
    recentLogs: pipelineState.logs.slice(-80),
  });
});

// ── Start pipeline ────────────────────────────────────────────────────────────
router.post("/pipeline/start", (req, res) => {
  if (pipelineState.status === "running")
    return res.status(409).json({ error: "Pipeline already running" });
  const mode = req.body?.mode === "clean" ? "clean" : "incremental";
  res.json({ started: true, mode });
  runPipeline({ mode }).catch((err) =>
    console.error("[admin] Pipeline error:", err.message),
  );
});

// ── Stop pipeline ─────────────────────────────────────────────────────────────
router.post("/pipeline/stop", (req, res) => {
  if (pipelineState.status !== "running")
    return res.status(409).json({ error: "Pipeline not running" });
  stopPipeline();
  res.json({ ok: true });
});

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const [total, top, daily] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS total, COUNT(DISTINCT query) AS unique_queries FROM search_logs",
      ),
      pool.query(
        "SELECT query, COUNT(*) AS count, AVG(results)::NUMERIC(10,1) AS avg_results FROM search_logs GROUP BY query ORDER BY count DESC LIMIT 25",
      ),
      pool.query(
        "SELECT DATE(searched_at) AS day, COUNT(*) AS searches FROM search_logs WHERE searched_at > NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day DESC",
      ),
    ]);
    res.json({
      total: parseInt(total.rows[0].total),
      uniqueQueries: parseInt(total.rows[0].unique_queries),
      topQueries: top.rows,
      dailySearches: daily.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduler ─────────────────────────────────────────────────────────────────
router.get("/schedule", (req, res) => {
  res.json(scheduler.loadConfig());
});

router.post("/schedule", (req, res) => {
  try {
    const cfg = scheduler.applyConfig(req.body);
    res.json({ ok: true, config: cfg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
