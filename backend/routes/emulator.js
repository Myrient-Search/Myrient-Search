const express = require("express");
const router = express.Router();
const { query } = require("../db");
const {
  getEmulatorConfig,
  COMPATIBLE_SYSTEMS,
} = require("../lib/emulatorConfig");

// GET supported emulator systems
router.get("/systems", (req, res) => {
  if (process.env.EMULATOR_ENABLED !== "true") {
    return res.json({ systems: [] });
  }
  res.json({ systems: COMPATIBLE_SYSTEMS });
});

// GET emulator config for a category
router.get("/config", (req, res) => {
  try {
    const category = req.query.category;

    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }

    const config = getEmulatorConfig(category);
    if (!config) {
      return res
        .status(404)
        .json({ error: "No emulator available for this category" });
    }

    res.json({ config });
  } catch (error) {
    console.error("Error fetching emulator config:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Proxy BIOS files
router.get("/proxy-bios", async (req, res, next) => {
  // Block access if emulator is disabled
  if (process.env.EMULATOR_ENABLED !== "true") {
    return res.status(403).json({ error: "Emulator feature is disabled" });
  }

  const biosUrl = req.query.url;

  // Validate that URL is from GitHub
  if (!biosUrl || !biosUrl.startsWith("https://github.com")) {
    return res
      .status(400)
      .json({ error: "Invalid BIOS URL - only GitHub URLs are allowed" });
  }

  try {
    const response = await fetch(biosUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");

    res.setHeader("Content-Type", contentType || "application/octet-stream");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // Add all required cross-origin headers
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

    const stream = require("stream");
    const { promisify } = require("util");
    const pipeline = promisify(stream.pipeline);
    await pipeline(response.body, res);
  } catch (error) {
    console.error("Error proxying BIOS:", error);
    res.status(500).json({ error: "Failed to proxy BIOS" });
  }
});

// Proxy EmulatorJS assets
router.get("/emulatorjs/*filePath", async (req, res, next) => {
  try {
    // Extract the path after /emulatorjs/
    // In Express 5 / path-to-regexp v8, a named wildcard returns an array of path segments
    const filePathArray = req.params.filePath;
    const filePath = Array.isArray(filePathArray)
      ? filePathArray.join("/")
      : filePathArray;

    // Support both stable and latest paths
    const emulatorJsUrl = `https://cdn.emulatorjs.org/latest/data/${filePath}`;

    const response = await fetch(emulatorJsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Copy content type and length
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // Set special headers for WASM files
    if (filePath.endsWith(".wasm")) {
      res.setHeader("Content-Type", "application/wasm");
    }

    // Special handling for JavaScript files
    if (filePath.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
    }

    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

    const stream = require("stream");
    const { promisify } = require("util");
    const pipeline = promisify(stream.pipeline);
    await pipeline(response.body, res);
  } catch (error) {
    console.error("Error proxying EmulatorJS content:", error);
    res.status(500).json({ error: "Failed to proxy EmulatorJS content" });
  }
});

module.exports = router;
