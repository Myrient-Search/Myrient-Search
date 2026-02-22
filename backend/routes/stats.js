var express = require("express");
var router = express.Router();
const { query } = require("../db");
const { getMeiliClient, INDEX_NAME } = require("../meili");

// GET /stats — real counts from PostgreSQL + Meilisearch
router.get("/", async function (req, res) {
  try {
    const [dbResult, meiliStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total_files,
          COUNT(description) FILTER (WHERE description IS NOT NULL AND description <> '') AS files_with_metadata,
          MAX(created_at) AS last_crawl_date
        FROM games
      `),
      getMeiliClient()
        .index(INDEX_NAME)
        .getStats()
        .catch(() => null),
    ]);

    const row = dbResult.rows[0];
    res.json({
      total_files: parseInt(row.total_files, 10),
      files_with_metadata: parseInt(row.files_with_metadata, 10),
      indexed_documents: meiliStats?.numberOfDocuments ?? 0,
      last_crawl_date: row.last_crawl_date ?? null,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch stats", detail: err.message });
  }
});

module.exports = router;
