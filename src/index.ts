import { Command } from "commander";
import { generateRulesPermutationsCommand } from "./generateRulesPermutations";
import { loadConfigFile } from "./loadConfigFile";
import { createConsoleLogger, addFileTransports } from "./initLogger";

const program = new Command();

// Create console logger
const logger = createConsoleLogger();

program.version("0.0.1");
program.name("Vibotron");
program.description("Vibotron is a tool to generate system prompts for LLMs");

program.option(
  "-c, --config <path>",
  "Path to the config file",
  "./workspace/workspace.json"
);

const config = loadConfigFile(program);

generateRulesPermutationsCommand(program, config, logger);

program.parse(process.argv);

// Add file transports after parsing (when we have program options)
try {
  addFileTransports(logger, config);
} catch (error) {
  logger.warn("Could not enable file logging:", error);
}
