import { Command } from "commander";
import { generateRulesPermutationsCommand } from "./generateRulesPermutations";
import { generateSyntheticUserPromptsCommand } from "./generateSyntheticUserPrompts";
import { generateTargetSystemPromptCommand } from "./generateTargetSystemPrompt";
import { loadConfigFile } from "./loadConfigFile";
import { logger, addFileTransports } from "./initLogger";
import { initializeLLMClients } from "./llmClients";

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
} catch (error) {
  logger.warn("Could not enable file logging:", error);
}

// Initialize LLM clients
initializeLLMClients(config);

generateRulesPermutationsCommand(program, config);
generateSyntheticUserPromptsCommand(program, config);
generateTargetSystemPromptCommand(program, config);
program.parse(process.argv);
