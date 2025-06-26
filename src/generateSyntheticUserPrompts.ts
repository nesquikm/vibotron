import { Command } from "commander";
import { readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { callLLM } from "./llmClients";
import { logger } from "./initLogger";

export function generateSyntheticUserPromptsCommand(
  program: Command,
  config: any
) {
  program
    .command("generate-synthetic-user-prompts")
    .alias("gsup")
    .description("Generate synthetic user prompts for each rules permutation")
    .action(async () => {
      logger.info("==== Starting generate-synthetic-user-prompts command ====");

      const success = await generateSyntheticUserPrompts(config);

      if (success) {
        logger.info("Synthetic user prompts generated successfully");
      } else {
        logger.error("Failed to generate synthetic user prompts");
        process.exit(1);
      }
    });
}

export async function generateSyntheticUserPrompts(
  config: any
): Promise<boolean> {
  try {
    logger.info("Starting synthetic user prompts generation");

    // Validate required config paths
    const permutationsDir = config.output?.rules_permutations_directory;
    const syntheticPromptsDir = config.output?.synthetic_user_prompts_directory;
    const rulesAllFile = config.output?.rules_all_file;
    const servicePromptFile =
      config.service_prompts?.synthetic_user_prompt_generation;
    const temperature =
      config.output?.synthetic_user_prompts_temperature ?? 1.0;
    const promptsPerPermutation =
      config.output?.synthetic_user_prompts_per_permutation ?? 3;

    if (
      !permutationsDir ||
      !syntheticPromptsDir ||
      !rulesAllFile ||
      !servicePromptFile
    ) {
      logger.error(
        "Missing required configuration paths for synthetic user prompt generation"
      );
      return false;
    }

    // Check if required directories and files exist
    if (!existsSync(permutationsDir)) {
      logger.error(
        `Rules permutations directory does not exist: ${permutationsDir}`
      );
      return false;
    }

    if (!existsSync(rulesAllFile)) {
      logger.error(`Rules all file does not exist: ${rulesAllFile}`);
      return false;
    }

    if (!existsSync(servicePromptFile)) {
      logger.error(`Service prompt file does not exist: ${servicePromptFile}`);
      return false;
    }

    // Create output directory if it doesn't exist
    if (!existsSync(syntheticPromptsDir)) {
      mkdirSync(syntheticPromptsDir, { recursive: true });
      logger.info(
        `Created synthetic user prompts directory: ${syntheticPromptsDir}`
      );
    }

    // Read the rules_all content
    const rulesAllContent = readTextFile(rulesAllFile);
    if (rulesAllContent === null) {
      logger.error(`Failed to read rules all file: ${rulesAllFile}`);
      return false;
    }

    // Read the service prompt template
    const servicePromptTemplate = readTextFile(servicePromptFile);
    if (servicePromptTemplate === null) {
      logger.error(`Failed to read service prompt file: ${servicePromptFile}`);
      return false;
    }

    // Get all permutation files
    const permutationFiles = readdirSync(permutationsDir)
      .filter((file) => file.endsWith(".txt"))
      .sort((a, b) => a.localeCompare(b));

    logger.info(
      `Found ${permutationFiles.length} permutation files to process`
    );

    let totalGenerated = 0;

    // Process each permutation file
    for (const permutationFile of permutationFiles) {
      const permutationPath = join(permutationsDir, permutationFile);
      const baseFileName = basename(permutationFile, ".txt");

      logger.info(`Processing permutation: ${permutationFile}`);

      // Read the permutation content
      const permutationContent = readTextFile(permutationPath);
      if (permutationContent === null) {
        logger.warn(
          `Failed to read permutation file: ${permutationPath} - skipping`
        );
        continue;
      }

      // Prepare the service prompt by replacing placeholders
      const servicePrompt = servicePromptTemplate
        .replace(/{rules_all}/g, rulesAllContent)
        .replace(/{rule}/g, permutationContent);

      // Generate multiple synthetic user prompts for this permutation
      for (let i = 1; i <= promptsPerPermutation; i++) {
        const outputFileName = `${baseFileName}_${i}.txt`;
        const outputPath = join(syntheticPromptsDir, outputFileName);

        logger.info(
          `Generating synthetic user prompt ${i}/${promptsPerPermutation} for ${baseFileName}`
        );

        try {
          // Call the target LLM to generate synthetic user prompt
          const syntheticPrompt = await callLLM(
            servicePrompt,
            `Generate a synthetic user prompt that would test the rules and constraints defined above.`,
            "target",
            temperature
          );

          if (syntheticPrompt) {
            // Create output content with metadata
            const outputContent = [
              `// Generated synthetic user prompt`,
              `// Source permutation: ${permutationFile}`,
              `// Generated at: ${new Date().toISOString()}`,
              `// Temperature: ${temperature}`,
              ``,
              syntheticPrompt,
            ].join("\n");

            writeTextFile(outputPath, outputContent);
            totalGenerated++;
            logger.debug(`Generated synthetic user prompt: ${outputFileName}`);
          } else {
            logger.warn(
              `Failed to generate synthetic user prompt for ${baseFileName}_${i}`
            );
          }
        } catch (error) {
          logger.error(
            `Error generating synthetic user prompt for ${baseFileName}_${i}:`,
            error
          );
        }
      }
    }

    logger.info(
      `Generated ${totalGenerated} synthetic user prompts from ${permutationFiles.length} permutations`
    );
    return true;
  } catch (error) {
    logger.error("Error in generateSyntheticUserPrompts:", error);
    return false;
  }
}
