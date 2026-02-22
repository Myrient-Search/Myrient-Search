var express = require("express");
var router = express.Router();
const { query } = require("../db");

// GET /games/:id — fetch a single game by PK from PostgreSQL
router.get("/:id", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const { rows } = await query("SELECT * FROM games WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Game not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Game lookup error:", err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

module.exports = router;
