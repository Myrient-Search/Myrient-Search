/**
 * scheduler.js — cron-based pipeline scheduling using node-cron.
 *
 * Schedule is stored in backend/scheduler-config.json.
 * If the file doesn't exist, scheduling is disabled.
 */

const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const { runPipeline } = require("./pipeline");

const CONFIG_FILE = path.resolve(__dirname, "scheduler-config.json");
const DEFAULT_CONFIG = { enabled: false, mode: "incremental", expression: "" };

let currentTask = null;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function start() {
  stop();
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.expression) return;
  if (!cron.validate(cfg.expression)) {
    console.error(`[scheduler] Invalid cron expression: "${cfg.expression}"`);
    return;
  }
  currentTask = cron.schedule(
    cfg.expression,
    async () => {
      console.log(`[scheduler] Triggered pipeline (${cfg.mode})`);
      try {
        await runPipeline({ mode: cfg.mode });
      } catch (err) {
        console.error("[scheduler] Pipeline error:", err.message);
      }
    },
    { timezone: "UTC" },
  );
  console.log(
    `[scheduler] Schedule active: "${cfg.expression}" (${cfg.mode} mode, UTC)`,
  );
}

function stop() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
}

function applyConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  // Validate cron expression if provided
  if (merged.expression && !cron.validate(merged.expression)) {
    throw new Error(`Invalid cron expression: "${merged.expression}"`);
  }
  saveConfig(merged);
  start(); // restart with new config
  return merged;
}

module.exports = { start, stop, loadConfig, applyConfig };
