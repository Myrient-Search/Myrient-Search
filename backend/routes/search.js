var express = require('express');
var router = express.Router();
const mockGames = require("../data/mock_games.json");

router.get('/', function(req, res){
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

module.exports = router;