const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const MYRIENT_URL = "https://myrient.erista.me/files/";
const OUTPUT_PATH = path.join(__dirname, "data", "scraped_games.json");
const LIMIT = 999999999999999999999;

class FileParser {
  parseFilename(filename) {
    const nameNoExt = path.parse(filename).name;
    const baseNameMatch = nameNoExt.split(/\s*\(|\[/, 1);
    const baseName = baseNameMatch[0].trim();

    const tags = new Set();
    const tagRegex = /[\[(](.*?)[\])]/g;
    let match;
    while ((match = tagRegex.exec(nameNoExt)) !== null) {
      tags.add(match[1].trim());
    }

    const revision = this._parseRevision(nameNoExt);

    const categorizedTags = {};
    for (const tag of tags) {
      const category = this.categorizeTag(tag);
      if (!categorizedTags[category]) {
        categorizedTags[category] = [];
      }
      categorizedTags[category].push(tag);
    }

    return {
      name_raw: filename,
      base_name: baseName,
      tags: Array.from(tags),
      categorizedTags: categorizedTags,
      revision: revision,
    };
  }

  _parseRevision(nameNoExt) {
    const lowerCaseName = nameNoExt.toLowerCase();

    // Prioritize numbered releases (e.g., v1.2.3, Rev 2)
    const versionMatch = lowerCaseName.match(
      /(?:\(v|ver|version|rev|revision)\.?\s*([\d\.]+)\)/,
    );
    if (versionMatch && versionMatch[1]) {
      const parts = versionMatch[1].split(".").map((p) => parseInt(p, 10) || 0);
      let num = 0;
      if (parts.length > 0) num += parts[0];
      if (parts.length > 1) num += parts[1] / 1000;
      if (parts.length > 2) num += parts[2] / 1000000;
      return num;
    }

    // Numbered Beta releases
    const betaNumMatch = lowerCaseName.match(/(?:\(beta)\s*(\d+)\)/);
    if (betaNumMatch && betaNumMatch[1]) {
      const num = parseInt(betaNumMatch[1], 10);
      return -1 + num / 100;
    }

    if (lowerCaseName.includes("(beta)")) return -2;

    const alphaNumMatch = lowerCaseName.match(/(?:\(alpha)\s*(\d+)\)/);
    if (alphaNumMatch && alphaNumMatch[1]) {
      const num = parseInt(alphaNumMatch[1], 10);
      return -3 + num / 100;
    }

    if (lowerCaseName.includes("(alpha)")) return -4;

    if (lowerCaseName.includes("(proto)")) {
      const dateMatch = lowerCaseName.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1]) {
        const dateAsNum = parseInt(dateMatch[1].replace(/-/g, ""), 10);
        return -5 + dateAsNum / 100000000;
      }
      return -6;
    }

    return 0.0;
  }

  categorizeTag(tag) {
    const trimmedTag = tag.trim();
    const parts = trimmedTag.split(/[,\+]/).map((p) => p.trim());
    const lowerParts = parts.map((p) => p.toLowerCase());

    const regionKeywords = [
      "usa",
      "japan",
      "europe",
      "world",
      "asia",
      "australia",
      "brazil",
      "canada",
      "china",
      "denmark",
      "finland",
      "france",
      "germany",
      "greece",
      "hong kong",
      "israel",
      "italy",
      "korea",
      "netherlands",
      "norway",
      "poland",
      "portugal",
      "russia",
      "spain",
      "sweden",
      "taiwan",
      "uk",
      "united kingdom",
    ];
    const regionSet = new Set(regionKeywords);
    const regionCount = lowerParts.filter((p) => regionSet.has(p)).length;
    if (regionCount > 0 && regionCount / parts.length >= 0.5) {
      return "Region";
    }

    const langKeywords = [
      "en",
      "ja",
      "fr",
      "de",
      "es",
      "it",
      "nl",
      "pt",
      "sv",
      "no",
      "da",
      "fi",
      "zh",
      "ko",
      "pl",
      "ru",
      "he",
      "ca",
      "ar",
      "tr",
      "zh-hant",
      "zh-hans",
    ];
    const langSet = new Set(langKeywords);
    const langCount = lowerParts.filter((p) => langSet.has(p)).length;
    if (langCount > 0 && langCount / parts.length >= 0.5) {
      return "Language";
    }

    return "Other";
  }
}

async function scrapeMyrient() {
  console.log(`Starting Myrient Scraper (Recursive) for: ${MYRIENT_URL}`);
  const parser = new FileParser();
  const scrapedGames = [];

  // Queue of URLs
  const visited = new Set();
  const queue = [MYRIENT_URL];

  // While we need more games and have places to look
  while (queue.length > 0 && scrapedGames.length < LIMIT) {
    const currentUrl = queue.shift();

    const [urlProto, urlHost] = currentUrl.split("://");
    const urlHostParts = urlHost.split("/").filter((entry) => entry != "");
    while (urlHostParts.at(-1) == "." || urlHostParts.at(-1) == "..") {
      if (urlHostParts.at(-1) == "..") {
        urlHostParts.pop();
        urlHostParts.pop();
      } else {
        urlHostParts.pop();
      }
    }
    const normalizedUrl = `${urlProto}://${urlHostParts.join("/")}`;

    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);
    visited.add(currentUrl);

    console.log(`[${scrapedGames.length}/${LIMIT}] Scraping: ${currentUrl}`);

    try {
      const { data: html } = await axios.get(currentUrl);
      const $ = cheerio.load(html);

      // Determine Platform from URL (Compact Logic)
      // Path: /files/Group/Platform/Subdir/
      const pathSegments = new URL(currentUrl).pathname
        .split("/")
        .filter((p) => p && p !== "files");
      const group = pathSegments[0] ? decodeURIComponent(pathSegments[0]) : "";
      const platform = pathSegments[1]
        ? decodeURIComponent(pathSegments[1])
        : group;

      // Extract and process links
      const links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        // Relative links only, no queries, no parent/current dir refs
        if (
          !href.startsWith("?") &&
          !href.match(/^[a-z]+:/) &&
          !href.startsWith("/") &&
          !href.split("/").includes("..") &&
          href !== "./"
        ) {
          links.push({ element: el, href: href });
        }
      });

      for (const item of links) {
        if (scrapedGames.length >= LIMIT) break;

        const href = item.href;
        const absoluteUrl = new URL(href, currentUrl).toString();
        const isDir = href.endsWith("/");

        if (isDir) {
          // Queue subdirectories if not visited
          const normAbsUrl = absoluteUrl.endsWith("/")
            ? absoluteUrl.slice(0, -1)
            : absoluteUrl;
          if (!visited.has(normAbsUrl)) {
            // Insert into queue in sorted order based on longest common prefix with current URL
            let longest = 0;
            let prev = longest;
            for (let url in queue) {
              longest = stringCompare(queue[url], absoluteUrl);
              if (prev == longest) {
                let index = url - 1;
                if (index < 0) index = 0;
                if (absoluteUrl[prev] > queue[index][prev]) continue;
                queue.splice(index, 0, absoluteUrl);
                break;
              } else if (url == queue.length - 1) {
                if (absoluteUrl[longest] > queue[url][longest]) {
                  queue.push(absoluteUrl);
                } else {
                  queue.splice(url, 0, absoluteUrl);
                }
              }
              prev = longest;
            }
            if (queue.length == 0) {
              queue.push(absoluteUrl);
            }
          }
        } else {
          // File found
          const filename = decodeURIComponent(href);
          const parsed = parser.parseFilename(filename);

          // Extract Size
          const sizeVal = $(item.element)
            .closest("tr")
            .find("td.size")
            .text()
            .trim();
          const size = sizeVal && sizeVal !== "-" ? sizeVal : "";

          scrapedGames.push({
            id: `${scrapedGames.length + 1}`,
            game_name: parsed.base_name,
            filename: filename,
            platform: platform,
            group: group,
            region: parsed.categorizedTags.Region
              ? parsed.categorizedTags.Region.join(", ")
              : "",
            size: size,
            download_url: absoluteUrl,
            tags: parsed.tags,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to scrape ${currentUrl}: ${err.message}`);
    }
  }

  // Write Output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(scrapedGames, null, 4));
  console.log(`Scraping Complete. Collected ${scrapedGames.length} games.`);
  console.log(`Output written to: ${OUTPUT_PATH}`);
}

scrapeMyrient();

function stringCompare(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const charA = a[i];
    const charB = b[i];
    if (charA !== charB) {
      return i;
    }
  }
}
