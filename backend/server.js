const express = require("express");
require("dotenv").config();
const mockGames = require("./data/mock_games.json");
const recommendedEmus = require("./data/recommended_emus.json");

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;

  const filtered = mockGames.filter((g) =>
    g.game_name.toLowerCase().includes(q),
  );

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginated = filtered.slice(startIndex, endIndex);

  res.json({
    results: paginated,
    total: filtered.length,
    page: page,
    limit: limit,
    total_pages: Math.ceil(filtered.length / limit),
  });
});

app.get("/emulators", (req, res) => {
  res.json(recommendedEmus);
});

app.get("/proxy-assets", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("No URL provided");

  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch: ${response.statusText}`);

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Error fetching asset");
  }
});

app.get("/health", (req, res) => {
  res.json({ backend: "OK" });
});

app.get("/stats", (req, res) => {
  res.json({
    total_queries: 0,
    total_files: 0,
    files_with_metadata: 0,
    last_crawl_date: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
