var express = require('express');
var router = express.Router();
const recommendedEmus = require("../data/recommended_emus.json");

router.get('/', function(req, res){
    res.json(recommendedEmus);
});

module.exports = router;