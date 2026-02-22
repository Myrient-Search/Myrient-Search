var express = require("express");
var router = express.Router();
const { getMeiliClient, INDEX_NAME } = require("../meili");
const { logSearch } = require("../db");

router.get("/", async function (req, res) {
  const q = req.query.q || "";
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

  // Build Meilisearch filter string from optional query params
  const filters = [];
  if (req.query.platform) {
    filters.push(`platform = "${req.query.platform}"`);
  }
  if (req.query.region) {
    filters.push(`region = "${req.query.region}"`);
  }
  if (req.query.genre) {
    filters.push(`genre = "${req.query.genre}"`);
  }

  try {
    const client = getMeiliClient();
    const index = client.index(INDEX_NAME);

    const searchResult = await index.search(q, {
      offset: (page - 1) * limit,
      limit,
      filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      attributesToRetrieve: [
        "id",
        "game_name",
        "filename",
        "platform",
        "group_name",
        "region",
        "size",
        "download_url",
        "tags",
        "description",
        "rating",
        "release_date",
        "developer",
        "publisher",
        "genre",
        "images",
      ],
    });

    if (q) logSearch(q, searchResult.estimatedTotalHits || 0);

    res.json({
      results: searchResult.hits,
      total: searchResult.estimatedTotalHits,
      page,
      limit,
      total_pages: Math.ceil((searchResult.estimatedTotalHits || 0) / limit),
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

module.exports = router;
