const path = require("path");
const express = require("express");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const { initDb } = require("./db");
const { initMeili } = require("./meili");
const scheduler = require("./scheduler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
require("./routes/index.js")(app);

async function start() {
  try {
    await initDb();
    await initMeili();
  } catch (err) {
    console.error("Startup warning — DB/Meili unavailable:", err.message);
  }

  // Boot scheduler (no-op if disabled or no config file)
  scheduler.start();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (!process.env.ADMIN_KEY)
      console.warn("⚠  ADMIN_KEY not set — admin panel disabled.");
  });
}

start();
