import { Command } from "commander";
import { readdirSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { callLLM, getLLMConfig } from "./llmClients";
import { logger } from "./initLogger";

export function generateSyntheticUserPromptResponsesCommand(
  program: Command,
  configLoader: (program: Command) => any
) {
  program
    .command("generate-synthetic-user-prompt-responses")
    .alias("gsupr")
    .description("Generate target LLM responses for all synthetic user prompts")
    .action(async () => {
      logger.info(
        "==== Starting generate-synthetic-user-prompt-responses command ===="
      );

      const config = configLoader(program);
      const success = await generateSyntheticUserPromptResponses(config);

      if (success) {
        logger.info("Synthetic user prompt responses generated successfully");
      } else {
        logger.error("Failed to generate synthetic user prompt responses");
        process.exit(1);
      }
    });
}

export async function generateSyntheticUserPromptResponses(
  config: any
): Promise<boolean> {
  try {
    logger.info("Starting synthetic user prompt responses generation");

    // Validate required config paths
    const syntheticPromptsDir = config.output?.synthetic_user_prompts_directory;
    const responsesDir =
      config.output?.synthetic_user_prompts_responses_directory;
    const targetSystemPromptFile = config.output?.target_system_prompt_file;

    if (!syntheticPromptsDir || !responsesDir || !targetSystemPromptFile) {
      logger.error(
        "Missing required configuration paths for synthetic user prompt responses generation"
      );
      return false;
    }

    // Check if required directories and files exist
    if (!existsSync(syntheticPromptsDir)) {
      logger.error(
        `Synthetic user prompts directory does not exist: ${syntheticPromptsDir}`
      );
      return false;
    }

    if (!existsSync(targetSystemPromptFile)) {
      logger.error(
        `Target system prompt file does not exist: ${targetSystemPromptFile}`
      );
      return false;
    }

    // Clear and create output directory
    if (existsSync(responsesDir)) {
      rmSync(responsesDir, { recursive: true, force: true });
      logger.info(`Cleared responses directory: ${responsesDir}`);
    }
    mkdirSync(responsesDir, { recursive: true });
    logger.info(`Created responses directory: ${responsesDir}`);

    // Read the target system prompt
    const targetSystemPromptContent = readTextFile(targetSystemPromptFile);
    if (targetSystemPromptContent === null) {
      logger.error(
        `Failed to read target system prompt file: ${targetSystemPromptFile}`
      );
      return false;
    }

    // Extract just the system prompt content (after the last comment section)
    const lines = targetSystemPromptContent.split("\n");
    const systemPromptStartIndex = lines.findIndex((line) =>
      line.includes("// Generated target system prompt:")
    );
    const systemPrompt =
      systemPromptStartIndex >= 0
        ? lines
            .slice(systemPromptStartIndex + 1)
            .join("\n")
            .trim()
        : targetSystemPromptContent.trim();

    logger.info(
      `Using target system prompt (${systemPrompt.length} characters)`
    );

    // Get parallelism setting from LLM config
    const llmConfig = getLLMConfig();
    const parallelism = llmConfig?.clients?.target?.parallelism ?? 3;
    logger.info(`Using parallelism: ${parallelism}`);

    // Get all synthetic user prompt files
    const promptFiles = readdirSync(syntheticPromptsDir)
      .filter((file) => file.endsWith(".txt"))
      .sort((a, b) => a.localeCompare(b));

    logger.info(
      `Found ${promptFiles.length} synthetic user prompt files to process`
    );

    // Create all generation tasks
    interface ResponseTask {
      promptFile: string;
      promptPath: string;
      outputPath: string;
      userPrompt: string;
    }

    const allTasks: ResponseTask[] = [];

    // Prepare all tasks first
    for (const promptFile of promptFiles) {
      const promptPath = join(syntheticPromptsDir, promptFile);
      const outputPath = join(responsesDir, promptFile);

      // Read the synthetic user prompt
      const promptContent = readTextFile(promptPath);
      if (promptContent === null) {
        logger.warn(`Failed to read prompt file: ${promptPath} - skipping`);
        continue;
      }

      // Extract just the user prompt content (after the last comment section)
      const promptLines = promptContent.split("\n");
      const responseStartIndex = promptLines.findIndex((line) =>
        line.includes("// Generated response:")
      );
      const userPrompt =
        responseStartIndex >= 0
          ? promptLines
              .slice(responseStartIndex + 1)
              .join("\n")
              .trim()
          : promptContent.trim();

      allTasks.push({
        promptFile,
        promptPath,
        outputPath,
        userPrompt,
      });
    }

    logger.info(`Created ${allTasks.length} response generation tasks`);

    // Execute tasks in parallel batches with fail-fast behavior
    let totalGenerated = 0;
    const executeTask = async (task: ResponseTask): Promise<boolean> => {
      logger.info(`Generating response for: ${task.promptFile}`);

      try {
        // Call the target LLM to generate response
        const response = await callLLM(systemPrompt, task.userPrompt, "target");

        if (response) {
          // Create output content with metadata
          const outputContent = [
            `// Generated target LLM response`,
            `// Source prompt: ${task.promptFile}`,
            `// Generated at: ${new Date().toISOString()}`,
            ``,
            `// System prompt used:`,
            ...systemPrompt.split("\n").map((line) => `// ${line}`),
            ``,
            `// User prompt:`,
            ...task.userPrompt.split("\n").map((line) => `// ${line}`),
            ``,
            `// Generated response:`,
            response,
          ].join("\n");

          writeTextFile(task.outputPath, outputContent);
          logger.debug(`Generated response: ${task.promptFile}`);
          return true;
        } else {
          logger.warn(`Failed to generate response for: ${task.promptFile}`);
          return false;
        }
      } catch (error) {
        logger.error(
          `Error generating response for ${task.promptFile}:`,
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
      `Successfully generated all ${totalGenerated} responses from ${promptFiles.length} synthetic user prompts`
    );

    return true;
  } catch (error) {
    logger.error("Error in generateSyntheticUserPromptResponses:", error);
    return false;
  }
}
