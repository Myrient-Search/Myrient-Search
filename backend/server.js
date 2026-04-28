const path = require("path");
const express = require("express");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const { initDb } = require("./db");
const { initMeili } = require("./meili");
const scheduler = require("./scheduler");
const torrentService = require("./torrentService");

// WebTorrent emits async errors from internal sockets (UDP trackers, DHT,
// peer wires) that we can't subscribe to from outside. On Node 24 an
// unhandled rejection terminates the process, which causes Docker to restart
// the container — every download request then 502s for ~10s while it boots.
// Log and keep serving.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err?.stack || err?.message || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err?.stack || err?.message || err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
require("./routes/index.js")(app);

app.use((err, req, res, _next) => {
  console.error("[express] unhandled route error:", err?.stack || err?.message || err);
  if (res.headersSent) return res.destroy();
  res.status(500).json({ error: "Internal server error", detail: err?.message || String(err) });
});

async function start() {
  try {
    await initDb();
    await initMeili();
  } catch (err) {
    console.error("Startup warning — DB/Meili unavailable:", err.message);
  }

  torrentService.getClient().catch((err) =>
    console.error("Torrent client startup warn:", err.message),
  );

  scheduler.start();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (!process.env.ADMIN_KEY)
      console.warn("⚠  ADMIN_KEY not set — admin panel disabled.");
  });
}

start();
