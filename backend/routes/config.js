const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    appName: process.env.APPLICATION_NAME || "",
  });
});

module.exports = router;
