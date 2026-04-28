var express = require("express");
var router = express.Router();
const { query } = require("../db");
const torrentService = require("../torrentService");

router.get("/:id", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const { rows } = await query("SELECT * FROM games WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Game not found" });
    const game = rows[0];
    if (game.magnet) {
      game.download_url = `/api/proxy-download?id=${game.id}`;
    } else {
      game.download_url = null;
    }
    res.json(game);
  } catch (err) {
    console.error("Game lookup error:", err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

router.post("/:id/warm", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { rows } = await query(
      "SELECT magnet FROM games WHERE id = $1",
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: "Game not found" });
    if (!rows[0].magnet)
      return res.status(503).json({ error: "Game has no magnet" });
    res.json({ ok: true });
    torrentService.warmTorrent(rows[0].magnet).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

router.get("/:id/torrent-status", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { rows } = await query(
      "SELECT magnet, so_id, filename FROM games WHERE id = $1",
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: "Game not found" });
    const { magnet, so_id, filename } = rows[0];
    if (!magnet) return res.json({ loaded: false, pending: false, hasMagnet: false });
    const status = torrentService.getFileStatus({
      magnet,
      soId: so_id,
      filename,
    });
    res.json({ ...status, hasMagnet: true });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

router.get("/:id/magnet", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { rows } = await query(
      "SELECT magnet, so_id, filename, size_bytes FROM games WHERE id = $1",
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: "Game not found" });
    if (!rows[0].magnet)
      return res.status(503).json({ error: "Game has no magnet" });
    res.json({
      magnet: torrentService.withTrackers(rows[0].magnet, {
        includeBrowserTrackers: true,
      }),
      so_id: rows[0].so_id,
      filename: rows[0].filename,
      size_bytes: rows[0].size_bytes != null ? Number(rows[0].size_bytes) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

module.exports = router;
