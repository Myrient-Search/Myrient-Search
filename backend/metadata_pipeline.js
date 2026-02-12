const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Credentials
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Input/Output
const MOCK_GAMES_PATH = path.join(__dirname, "data", "mock_games.json");
const OUTPUT_PATH = path.join(__dirname, "data", "processed_games.json");

// Configuration
const BATCH_SIZE = 10; // IGDB Multiquery limit is typically 10
const RATE_LIMIT_DELAY = 250; // 4 requests per second = 250ms spacing

// --- Helpers ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getIGDBToken() {
  console.log("Authenticating with IGDB...");
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data.access_token) {
      console.log("IGDB Auth Successful");
      return data.access_token;
    }
    throw new Error("No access token returned");
  } catch (err) {
    console.error("IGDB Auth Failed:", err);
    return null;
  }
}

async function batchSearchIGDB(token, gamesBatch) {
  // gamesBatch is array of { id, game_name, videogame ... }
  // We will construct a multiquery body

  // Fields we want
  const fields = [
    "name",
    "summary",
    "rating",
    "first_release_date",
    "involved_companies.company.name",
    "genres.name",
    "cover.url",
    "screenshots.url",
    "videos.video_id",
  ].join(",");

  let queryBody = "";

  gamesBatch.forEach((game, index) => {
    // Alias is "query_index"
    const safeName = game.game_name.replace(/"/g, '\\"');
    // Use 'where' with contains and Sort by popularity (rating_count) to find main game.
    queryBody += `query games "q_${index}" { fields ${fields}; where name ~ "${safeName}"*; sort rating_count desc; limit 1; };\n`;
  });

  try {
    const res = await fetch("https://api.igdb.com/v4/multiquery", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: queryBody,
    });

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("IGDB Batch Error: Response is not an array", data);
      return [];
    }

    return data; // Array of { name: "q_0", result: [...] }
  } catch (err) {
    console.error("IGDB Batch Network Error:", err);
    return [];
  }
}

// --- Main Pipeline ---

async function runPipeline() {
  console.log(
    "Starting Optimized Metadata Pipeline (IGDB Only - Concurrent)...",
  );

  // 1. Read Data
  const rawData = fs.readFileSync(MOCK_GAMES_PATH, "utf-8");
  const games = JSON.parse(rawData);
  const processedGamesMap = new Map();

  // Initialize map with original data
  games.forEach((g) => processedGamesMap.set(g.id, { ...g }));

  // 2. Auth
  const igdbToken = await getIGDBToken();
  if (!igdbToken) {
    console.error("Cannot proceed without IGDB token.");
    return;
  }

  // 3. Batch Preparation
  const batches = [];
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    batches.push(games.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `Prepared ${games.length} games in ${batches.length} batches (Batch Size: ${BATCH_SIZE}).`,
  );
  console.log(
    `Starting concurrent processing (Rate Limit: ${RATE_LIMIT_DELAY}ms interval)...`,
  );

  // 4. Concurrent Processing
  // We fire requests at fixed intervals within the allowed rate limit
  const pendingPromises = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];

    // Fire request (DO NOT AWAIT HERE - this provides concurrency)
    const p = processBatch(
      igdbToken,
      batch,
      processedGamesMap,
      b,
      batches.length,
    );
    pendingPromises.push(p);

    // Enforce Rate Limit: Wait before launching NEXT request
    if (b < batches.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  // Wait for all in-flight requests to land
  await Promise.all(pendingPromises);

  // 5. Write Output
  const outputList = Array.from(processedGamesMap.values());

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputList, null, 4));
  console.log(`Pipeline Complete. Processed ${outputList.length} games.`);
  console.log(`Output written to: ${OUTPUT_PATH}`);
}

async function processBatch(token, batch, map, batchIdx, totalBatches) {
  // console.log(`  [Fire] Batch ${batchIdx + 1}/${totalBatches}`);

  try {
    const results = await batchSearchIGDB(token, batch);

    // Match results back to games
    results.forEach((item) => {
      const indexInBatch = parseInt(item.name.split("_")[1]);
      const game = batch[indexInBatch];

      if (item.result && item.result.length > 0) {
        const igdbData = item.result[0];
        const pGame = map.get(game.id);

        console.log(`    [Recv] Found: ${game.game_name} -> ${igdbData.name}`);

        // Map Data
        if (igdbData.summary) pGame.description = igdbData.summary;
        if (igdbData.rating)
          pGame.rating = parseFloat((igdbData.rating / 20).toFixed(1));
        if (igdbData.first_release_date) {
          const date = new Date(igdbData.first_release_date * 1000);
          pGame.release_date = date.toISOString().split("T")[0];
        }
        if (
          igdbData.involved_companies &&
          igdbData.involved_companies.length > 0
        ) {
          pGame.developer = igdbData.involved_companies[0].company.name;
          pGame.publisher = igdbData.involved_companies[0].company.name;
        }
        if (igdbData.genres && igdbData.genres.length > 0) {
          pGame.genre = igdbData.genres.map((g) => g.name).join(", ");
        }

        // Images
        const images = [];
        if (igdbData.cover && igdbData.cover.url) {
          let url = igdbData.cover.url.startsWith("//")
            ? "https:" + igdbData.cover.url
            : igdbData.cover.url;
          url = url.replace("t_thumb", "t_1080p");
          images.push(url);
        }
        if (igdbData.screenshots && igdbData.screenshots.length > 0) {
          igdbData.screenshots.slice(0, 3).forEach((s) => {
            let url = s.url.startsWith("//") ? "https:" + s.url : s.url;
            url = url.replace("t_thumb", "t_1080p");
            images.push(url);
          });
        }
        if (images.length > 0) pGame.images = images;
      } else {
        console.log(`    [Recv] Not Found: ${game.game_name}`);
      }
    });
  } catch (err) {
    console.error(`  [Error] Batch ${batchIdx + 1} failed:`, err);
  }
}

runPipeline();
