var express = require('express');
var router = express.Router();

router.get('/', function(req, res){
  res.json({ backend: "OK" });
});

module.exports = router;