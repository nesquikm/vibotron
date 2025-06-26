import { Command } from "commander";
import { generateRulesPermutationsCommand } from "./generateRulesPermutations";
import { loadConfigFile } from "./loadConfigFile";
import { logger, addFileTransports } from "./initLogger";

const program = new Command();

// Logger is imported as global instance

program.version("0.0.1");
program.name("Vibotron");
program.description("Vibotron is a tool to generate system prompts for LLMs");

program.option(
  "-c, --config <path>",
  "Path to the config file",
  "./workspace/workspace.json"
);

const config = loadConfigFile(program);

// Add file transports before parsing (so they're available during command execution)
try {
  addFileTransports(logger, config);
  logger.info("File logging enabled");
} catch (error) {
  logger.warn("Could not enable file logging:", error);
}

generateRulesPermutationsCommand(program, config);

program.parse(process.argv);
