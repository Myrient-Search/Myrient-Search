var express = require('express');
var router = express.Router();

router.get('/', function(req, res){
  res.json({
    total_queries: 0,
    total_files: 0,
    files_with_metadata: 0,
    last_crawl_date: new Date().toISOString(),
  });
});

module.exports = router;