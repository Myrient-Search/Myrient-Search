// See https://emulatorjs.org/docs/systems for available cores
const systemConfigs = require("./systemConfigs.json");

const COMPATIBLE_SYSTEMS = Object.keys(systemConfigs);

function isEmulatorCompatible(category) {
  if (process.env.EMULATOR_ENABLED !== "true") {
    return false;
  }

  return COMPATIBLE_SYSTEMS.includes(category);
}

function getEmulatorConfig(category) {
  const systemConfig = systemConfigs[category];
  if (!systemConfig) {
    return null;
  }

  return {
    core: systemConfig.core,
    system: category,
    unpackRoms: systemConfig.unpackRoms,
    bios: systemConfig.bios || null,
  };
}

module.exports = {
  isEmulatorCompatible,
  getEmulatorConfig,
  COMPATIBLE_SYSTEMS,
};
