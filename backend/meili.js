const { MeiliSearch } = require("meilisearch");

const INDEX_NAME = "games";

function getMeiliClient() {
  return new MeiliSearch({
    host: process.env.MEILI_HOST || "http://localhost:7700",
    apiKey: process.env.MEILI_MASTER_KEY || "minerva_meili_key",
  });
}

async function initMeili() {
  console.log("Initializing Meilisearch index...");
  const client = getMeiliClient();

  await client.createIndex(INDEX_NAME, { primaryKey: "id" }).catch((e) => {
    if (e.code !== "index_already_exists") throw e;
  });

  const index = client.index(INDEX_NAME);

  await index.updateSearchableAttributes([
    "game_name",
    "filename",
    "full_path",
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
    "is_non_game",
    "group_name",
  ]);

  await index.updateSortableAttributes([
    "rating",
    "release_date",
    "size_bytes",
  ]);

  console.log("Meilisearch index ready.");
}

module.exports = { getMeiliClient, initMeili, INDEX_NAME };
