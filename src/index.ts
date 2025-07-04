import { Command } from "commander";
import { generateRulesPermutationsCommand } from "./generateRulesPermutations";
import { generateSyntheticUserPromptsCommand } from "./generateSyntheticUserPrompts";
import { generateTargetSystemPromptCommand } from "./generateTargetSystemPrompt";
import { generateSyntheticUserPromptResponsesCommand } from "./generateSyntheticUserPromptResponses";
import { evaluateSyntheticUserPromptResponsesCommand } from "./evaluateSyntheticUserPromptResponses";
import { cleanOutputCommand } from "./cleanOutput";
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

// Helper function to load and initialize config
function loadAndInitializeConfig(program: Command) {
  const config = loadConfigFile(program);

  // Add file transports after loading config
  try {
    addFileTransports(logger, config);
  } catch (error) {
    logger.warn("Could not enable file logging:", error);
  }

  // Initialize LLM clients
  initializeLLMClients(config);

  return config;
}

// Add commands before parsing (they will load config lazily)
generateRulesPermutationsCommand(program, loadAndInitializeConfig);
generateSyntheticUserPromptsCommand(program, loadAndInitializeConfig);
generateSyntheticUserPromptResponsesCommand(program, loadAndInitializeConfig);
evaluateSyntheticUserPromptResponsesCommand(program, loadAndInitializeConfig);
generateTargetSystemPromptCommand(program, loadAndInitializeConfig);
cleanOutputCommand(program, loadAndInitializeConfig);

// Parse arguments
program.parse(process.argv);
