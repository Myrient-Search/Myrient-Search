var express = require("express");
var router = express.Router();
const { getMeiliClient, INDEX_NAME } = require("../meili");

// ─── AI Tool Definitions ────────────────────────────────────────────────────

const tools = [
  {
    type: "function",
    function: {
      name: "search_games",
      description:
        "Search for retro games and ROMs in the Myrient database. Use simple, flexible text searches for best results. The search is fuzzy and will find partial matches.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query - game name or title. Examples: 'Super Mario', 'Final Fantasy'. Keep it simple for best results.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (1-5, default 5)",
            minimum: 1,
            maximum: 5,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_search_suggestions",
      description:
        "Get search suggestions based on a partial query. Useful for helping users discover games or correct typos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Partial search query to get suggestions for",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────────────

async function searchGames(args) {
  const { query, limit = 5 } = args;
  if (!query || typeof query !== "string") {
    throw new Error("Query is required and must be a string");
  }

  const client = getMeiliClient();
  const index = client.index(INDEX_NAME);

  const result = await index.search(query.trim(), {
    limit: Math.min(Math.max(1, limit), 5), // Max 5 to save context window tokens
    attributesToRetrieve: [
      "id",
      "game_name",
      "filename",
      "platform",
      "region",
      "size",
      "genre",
      "release_date",
      "description",
    ],
  });

  const baseUrl = process.env.BASE_URL || "";

  const formatted = result.hits.map((item) => ({
    id: item.id,
    game_name: item.game_name || item.filename,
    platform: item.platform,
    region: item.region,
    genre: item.genre,
    release_date: item.release_date,
    // Truncate description heavily to save tokens! Groq has very strict TPM limit
    description: item.description
      ? item.description.substring(0, 100) + "..."
      : undefined,
    urls: {
      info: `${baseUrl}/game/${item.id}`,
    },
  }));

  return {
    query,
    results: formatted,
    total_found: result.estimatedTotalHits,
    total_returned: formatted.length,
  };
}

async function getSearchSuggestions(args) {
  const { query } = args;
  if (!query || typeof query !== "string") {
    throw new Error("Query is required and must be a string");
  }

  const client = getMeiliClient();
  const index = client.index(INDEX_NAME);

  const result = await index.search(query.trim(), {
    limit: 5,
    attributesToRetrieve: ["game_name", "filename"],
  });

  const suggestions = [
    ...new Set(
      result.hits.map((h) => h.game_name || h.filename).filter(Boolean),
    ),
  ].slice(0, 5);

  return { query, suggestions };
}

async function executeToolCall(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  let args;
  try {
    args = typeof argsString === "string" ? JSON.parse(argsString) : argsString;
  } catch (e) {
    throw new Error(`Invalid JSON arguments for ${name}: ${e.message}`);
  }

  switch (name) {
    case "search_games":
      return await searchGames(args);
    case "get_search_suggestions":
      return await getSearchSuggestions(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful AI assistant for the Myrient Search Engine, a website that helps users find and search through retro games and ROMs.

About Myrient:
- Myrient is a preservation project offering a comprehensive collection of retro games
- Users can search for games by name, platform, region, and genre
- The site includes a built-in emulator for playing games in the browser
- The search engine indexes thousands of games from various gaming systems

Your role:
- Help users find games using the search_games tool
- Provide information about gaming history, consoles, and game recommendations
- Answer questions about how to use the search features
- Keep responses SHORT, CONCISE and SIMPLE
- Present search results as simple bullet lists — NOT tables
- Limit responses to 3-5 game recommendations to keep it readable
- When users ask about downloading, remind them Myrient focuses on preservation

IMPORTANT SEARCH STRATEGY:
- When users describe a game, identify the likely game title before searching
- Use SIMPLE searches with just the game title for best results
- The search is fuzzy and finds partial matches — keep queries simple
- If first search returns few results, try alternative terms
- Limit to 2-3 searches maximum for recommendations

CRITICAL LINKING RULES:
- NEVER make up URLs — ONLY use URLs from the search_games tool results
- When mentioning specific games found via search_games, ALWAYS link using the urls.info value
- Format: [Game Title](EXACT_INFO_URL_FROM_SEARCH_RESULTS)
- If you haven't searched for a game, do NOT create any links for it`;

router.post("/", async function (req, res) {
  const { message, conversation } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required" });
  }

  const aiEnabled = process.env.AI_ENABLED === "true";
  const apiKey = process.env.AI_API_KEY;
  let apiUrl =
    process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-3.5-turbo";

  // Automatically rewrite native Gemini URLs to their OpenAI-compatible endpoint
  const isGemini =
    apiUrl.includes("generativelanguage.googleapis.com") ||
    model.includes("gemini");
  if (isGemini && !apiUrl.includes("openai")) {
    apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }

  if (!aiEnabled) {
    return res.status(503).json({
      error: "AI chat is currently disabled. Please contact the administrator.",
    });
  }

  if (!apiKey) {
    return res.status(503).json({
      error: "AI service is not configured. Please contact the administrator.",
    });
  }

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    let messages = [{ role: "system", content: SYSTEM_PROMPT }];

    if (conversation && Array.isArray(conversation)) {
      messages = messages.concat(conversation);
    }
    messages.push({ role: "user", content: message });

    let currentRound = 0;
    const maxToolRounds = 2; // Strict limit to prevent infinite loops and ratelimits
    let isDone = false;

    while (currentRound < maxToolRounds && !isDone) {
      currentRound++;
      const isLastRound = currentRound === maxToolRounds;

      const bodyPayload = {
        model,
        messages,
        tools,
        tool_choice: isLastRound ? "none" : "auto",
        max_tokens: 1000,
        temperature: 0.7,
        stream: true,
      };

      // Add reasoning effort for Gemini reasoning models
      if (isGemini) {
        bodyPayload.reasoning_effort = "low"; // Keep it low to stay fast
      }

      const fetchOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "Myrient-Search/2.0",
        },
        body: JSON.stringify(bodyPayload),
      };

      const aiResponse = await fetch(apiUrl, fetchOptions);

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI API Error:", aiResponse.status, errorText);

        if (aiResponse.status === 401) {
          sendEvent("error", {
            message: "AI authentication failed. Check your API key.",
          });
        } else if (aiResponse.status === 429) {
          sendEvent("error", {
            message:
              "AI service is busy (rate limited). Try a smaller model or switch providers.",
          });
        } else {
          // Send the specific API error text back to the frontend for easy debugging
          const errorMsg = errorText.substring(0, 200).replace(/\n/g, " ");
          sendEvent("error", {
            message: `AI Error (${aiResponse.status}): ${errorMsg}...`,
          });
        }
        break;
      }

      const reader = aiResponse.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      let assistantContent = "";
      let toolCallsAcc = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (let line of lines) {
          line = line.trim();
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              // Depending on the model, thoughts might be injected, but usually it's just delta.content
              if (delta.content) {
                assistantContent += delta.content;
                sendEvent("chunk", { content: delta.content });
              }

              if (delta.tool_calls) {
                delta.tool_calls.forEach((tc, arrIdx) => {
                  const idx = tc.index !== undefined ? tc.index : arrIdx;
                  if (!toolCallsAcc[idx]) {
                    toolCallsAcc[idx] = {
                      id: tc.id,
                      type: "function",
                      function: {
                        name: tc.function?.name || "",
                        arguments: "",
                      },
                    };
                  }
                  if (tc.function?.arguments) {
                    toolCallsAcc[idx].function.arguments +=
                      tc.function.arguments;
                  }
                  if (tc.extra_content !== undefined) {
                    toolCallsAcc[idx].extra_content = tc.extra_content;
                  }
                  if (tc.extra_body !== undefined) {
                    toolCallsAcc[idx].extra_body = tc.extra_body;
                  }
                });
              }
            } catch (e) {
              // ignore parse error of partial stream
            }
          }
        }
      }

      toolCallsAcc = toolCallsAcc.filter(Boolean);
      const assistantMessage = {
        role: "assistant",
        content: assistantContent || "", // Use empty string instead of null to fix strict APIs
      };

      if (toolCallsAcc.length > 0) {
        assistantMessage.tool_calls = toolCallsAcc;
        messages.push(assistantMessage);

        for (const tc of toolCallsAcc) {
          sendEvent("tool_start", { name: tc.function.name });

          try {
            const toolResult = await executeToolCall(tc);
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
            const resCount =
              toolResult.total_found ??
              (toolResult.suggestions ? toolResult.suggestions.length : 0);
            sendEvent("tool_result", {
              name: tc.function.name,
              count: resCount,
            });
          } catch (err) {
            console.error("Tool exec error:", err);
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: err.message }),
            });
            sendEvent("tool_result", {
              name: tc.function.name,
              error: err.message,
            });
          }
        }
      } else {
        messages.push(assistantMessage);
        isDone = true;
      }
    }

    sendEvent("done", { conversation: messages.slice(1) });
    res.end();
  } catch (err) {
    console.error("AI Chat Error:", err);
    sendEvent("error", { message: "An unexpected error occurred." });
    res.end();
  }
});

module.exports = router;
