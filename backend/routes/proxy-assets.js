var express = require('express');
var router = express.Router();

router.get('/', async function(req, res){
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

module.exports = router;