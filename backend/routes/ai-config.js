var express = require("express");
var router = express.Router();

/**
 * GET /ai-config
 * Returns public AI configuration (enabled status, provider name, model).
 * Used by the frontend to display AI info on the About page.
 */
router.get("/", function (req, res) {
  const aiEnabled = process.env.AI_ENABLED === "true";
  const apiUrl = process.env.AI_API_URL || "";
  const model = process.env.AI_MODEL || "default";

  // Detect provider from API URL (mirrors v1 logic)
  const knownProviders = [
    { pattern: "api.groq.com", name: "Groq" },
    { pattern: "api.openai.com", name: "OpenAI" },
    { pattern: "api.anthropic.com", name: "Anthropic" },
    { pattern: "generativelanguage.googleapis.com", name: "Google Gemini" },
    { pattern: "api.perplexity.ai", name: "Perplexity" },
    { pattern: "api.cohere.ai", name: "Cohere" },
    { pattern: "api.mistral.ai", name: "Mistral" },
  ];
  const localPatterns = ["localhost", "127.0.0.1", "0.0.0.0"];

  let provider = "Unknown";

  if (aiEnabled && apiUrl) {
    if (localPatterns.some((p) => apiUrl.includes(p))) {
      provider = "Local LLM";
    } else {
      const known = knownProviders.find((p) => apiUrl.includes(p.pattern));
      if (known) {
        provider = known.name;
      } else {
        // Extract from domain
        try {
          const { hostname } = new URL(apiUrl);
          const domain = hostname.startsWith("api.")
            ? hostname.substring(4).split(".")[0]
            : hostname.split(".")[0];
          provider = domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
          provider = "Custom Provider";
        }
      }
    }
  }

  res.json({
    enabled: aiEnabled,
    provider: aiEnabled ? provider : null,
    model: aiEnabled ? model : null,
  });
});

module.exports = router;
