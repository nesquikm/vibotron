import { Command } from "commander";
import { readdirSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, basename } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { callLLM, getLLMConfig } from "./llmClients";
import { logger } from "./initLogger";

export function generateSyntheticUserPromptsCommand(
  program: Command,
  configLoader: (program: Command) => any
) {
  program
    .command("generate-synthetic-user-prompts")
    .alias("gsup")
    .description("Generate synthetic user prompts for each rules permutation")
    .action(async () => {
      logger.info("==== Starting generate-synthetic-user-prompts command ====");

      const config = configLoader(program);
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

    // Clear and create output directory
    if (existsSync(syntheticPromptsDir)) {
      rmSync(syntheticPromptsDir, { recursive: true, force: true });
      logger.info(
        `Cleared synthetic user prompts directory: ${syntheticPromptsDir}`
      );
    }
    mkdirSync(syntheticPromptsDir, { recursive: true });
    logger.info(
      `Created synthetic user prompts directory: ${syntheticPromptsDir}`
    );

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

    // Get parallelism setting from LLM config
    const llmConfig = getLLMConfig();
    const parallelism = llmConfig?.clients?.target?.parallelism ?? 3;
    logger.info(`Using parallelism: ${parallelism}`);

    // Create all generation tasks
    interface GenerationTask {
      permutationFile: string;
      baseFileName: string;
      servicePrompt: string;
      outputFileName: string;
      outputPath: string;
      index: number;
    }

    const allTasks: GenerationTask[] = [];

    // Prepare all tasks first
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

      // Create tasks for multiple synthetic user prompts for this permutation
      for (let i = 1; i <= promptsPerPermutation; i++) {
        const outputFileName = `${baseFileName}_${i}.txt`;
        const outputPath = join(syntheticPromptsDir, outputFileName);

        allTasks.push({
          permutationFile,
          baseFileName,
          servicePrompt,
          outputFileName,
          outputPath,
          index: i,
        });
      }
    }

    logger.info(`Created ${allTasks.length} generation tasks`);

    // Execute tasks in parallel batches
    let totalGenerated = 0;
    const executeTask = async (task: GenerationTask): Promise<boolean> => {
      logger.info(
        `Generating synthetic user prompt ${task.index}/${promptsPerPermutation} for ${task.baseFileName}`
      );

      try {
        // Call the service LLM to generate synthetic user prompt
        const syntheticPrompt = await callLLM(
          "",
          task.servicePrompt,
          "service",
          temperature
        );

        if (syntheticPrompt) {
          // Create output content with metadata and used prompt
          const outputContent = [
            `// Generated synthetic user prompt`,
            `// Source permutation: ${task.permutationFile}`,
            `// Generated at: ${new Date().toISOString()}`,
            `// Temperature: ${temperature}`,
            ``,
            `// Service prompt used for generation:`,
            ...task.servicePrompt.split("\n").map((line) => `// ${line}`),
            ``,
            `// Generated response:`,
            syntheticPrompt,
          ].join("\n");

          writeTextFile(task.outputPath, outputContent);
          logger.debug(
            `Generated synthetic user prompt: ${task.outputFileName}`
          );
          return true;
        } else {
          logger.warn(
            `Failed to generate synthetic user prompt for ${task.baseFileName}_${task.index}`
          );
          return false;
        }
      } catch (error) {
        logger.error(
          `Error generating synthetic user prompt for ${task.baseFileName}_${task.index}:`,
          error
        );
        return false;
      }
    };

    // Process tasks in parallel batches with fail-fast behavior
    for (let i = 0; i < allTasks.length; i += parallelism) {
      const batch = allTasks.slice(i, i + parallelism);
      logger.info(
        `Processing batch ${Math.floor(i / parallelism) + 1}/${Math.ceil(
          allTasks.length / parallelism
        )} (${batch.length} tasks)`
      );

      const batchPromises = batch.map(executeTask);
      const batchResults = await Promise.allSettled(batchPromises);

      // Count successful generations in this batch
      const batchSuccess = batchResults.filter(
        (result) => result.status === "fulfilled" && result.value === true
      ).length;
      const batchFailed = batchResults.filter(
        (result) => result.status === "fulfilled" && result.value === false
      ).length;
      const batchRejected = batchResults.filter(
        (result) => result.status === "rejected"
      ).length;

      totalGenerated += batchSuccess;

      // Fail-fast: exit immediately if any tasks failed or were rejected
      if (batchFailed > 0 || batchRejected > 0) {
        const totalFailed = batchFailed + batchRejected;
        logger.error(
          `Batch failed: ${totalFailed} tasks failed. Stopping generation to prevent further errors.`
        );

        if (batchRejected > 0) {
          batchResults.forEach((result, index) => {
            if (result.status === "rejected") {
              logger.error(`Task ${i + index} rejected: ${result.reason}`);
            }
          });
        }

        const processedSoFar = i + batch.length;
        const remainingTasks = allTasks.length - processedSoFar;
        logger.error(
          `Generation stopped early. Processed: ${processedSoFar}/${allTasks.length} tasks. ${remainingTasks} tasks skipped.`
        );
        return false;
      }

      logger.info(
        `Batch completed: ${batchSuccess} successful, ${batchFailed} failed, ${batchRejected} rejected`
      );
    }

    // If we reach here, all batches completed successfully
    logger.info(
      `Successfully generated all ${totalGenerated} synthetic user prompts from ${permutationFiles.length} permutations`
    );

    return true;
  } catch (error) {
    logger.error("Error in generateSyntheticUserPrompts:", error);
    return false;
  }
}
