import { Command } from "commander";
import { readFileSync } from "fs";

export function loadConfigFile(program: Command) {
  // Load config file after parsing arguments
  const options = program.opts();
  const configData = JSON.parse(readFileSync(options.config, "utf8"));
  return configData;
}
