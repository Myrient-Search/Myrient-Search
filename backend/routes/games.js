var express = require('express');
var router = express.Router();
const mockGames = require("../data/mock_games.json");

router.get('/:id', function(req, res){
  const id = req.params.id;
  const game = mockGames.find(g => g.id === id);

  if (game) {
    res.json(game);
  } else {
    res.status(404).json({ error: "Game not found" });
  }
});

module.exports = router;
