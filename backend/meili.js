const { MeiliSearch } = require("meilisearch");

const INDEX_NAME = "games";

function getMeiliClient() {
  return new MeiliSearch({
    host: process.env.MEILI_HOST || "http://localhost:7700",
    apiKey: process.env.MEILI_MASTER_KEY || "myrient_meili_key",
  });
}

async function initMeili() {
  console.log("Initializing Meilisearch index...");
  const client = getMeiliClient();

  // Create index if it doesn't exist (idempotent)
  await client.createIndex(INDEX_NAME, { primaryKey: "id" }).catch((e) => {
    // 'index_already_exists' is not a real error here
    if (e.code !== "index_already_exists") throw e;
  });

  const index = client.index(INDEX_NAME);

  await index.updateSearchableAttributes([
    "game_name",
    "genre",
    "developer",
    "description",
    "tags",
  ]);

  await index.updateFilterableAttributes([
    "platform",
    "region",
    "tags",
    "genre",
  ]);

  await index.updateSortableAttributes(["rating", "release_date"]);

  console.log("Meilisearch index ready.");
}

module.exports = { getMeiliClient, initMeili, INDEX_NAME };
