import { Command } from "commander";
import { readdirSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, basename } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { callLLM, getLLMConfig } from "./llmClients";
import { logger } from "./initLogger";

export function evaluateSyntheticUserPromptResponsesCommand(
  program: Command,
  config: any
) {
  program
    .command("evaluate-synthetic-user-prompt-responses")
    .alias("esupr")
    .description("Evaluate synthetic user prompt responses against rules")
    .action(async () => {
      logger.info(
        "==== Starting evaluate-synthetic-user-prompt-responses command ===="
      );

      const success = await evaluateSyntheticUserPromptResponses(config);

      if (success) {
        logger.info("Synthetic user prompt responses evaluated successfully");
      } else {
        logger.error("Failed to evaluate synthetic user prompt responses");
        process.exit(1);
      }
    });
}

export async function evaluateSyntheticUserPromptResponses(
  config: any
): Promise<boolean> {
  try {
    logger.info("Starting synthetic user prompt responses evaluation");

    // Validate required config paths
    const responsesDir =
      config.output?.synthetic_user_prompts_responses_directory;
    const syntheticPromptsDir = config.output?.synthetic_user_prompts_directory;
    const permutationsDir = config.output?.rules_permutations_directory;
    const correctionsDir = config.output?.corrections_directory;
    const rulesAllFile = config.output?.rules_all_file;
    const servicePromptFile = config.service_prompts?.evaluation_correction;

    if (
      !responsesDir ||
      !syntheticPromptsDir ||
      !permutationsDir ||
      !correctionsDir ||
      !rulesAllFile ||
      !servicePromptFile
    ) {
      logger.error("Missing required configuration paths for evaluation");
      return false;
    }

    // Check if required directories and files exist
    if (!existsSync(responsesDir)) {
      logger.error(`Responses directory does not exist: ${responsesDir}`);
      return false;
    }

    if (!existsSync(syntheticPromptsDir)) {
      logger.error(
        `Synthetic prompts directory does not exist: ${syntheticPromptsDir}`
      );
      return false;
    }

    if (!existsSync(permutationsDir)) {
      logger.error(`Permutations directory does not exist: ${permutationsDir}`);
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
    if (existsSync(correctionsDir)) {
      rmSync(correctionsDir, { recursive: true, force: true });
      logger.info(`Cleared corrections directory: ${correctionsDir}`);
    }
    mkdirSync(correctionsDir, { recursive: true });
    logger.info(`Created corrections directory: ${correctionsDir}`);

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

    // Get parallelism setting from LLM config
    const llmConfig = getLLMConfig();
    const parallelism = llmConfig?.clients?.service?.parallelism ?? 3;
    logger.info(`Using parallelism: ${parallelism}`);

    // Get all response files
    const responseFiles = readdirSync(responsesDir)
      .filter((file) => file.endsWith(".txt"))
      .sort((a, b) => a.localeCompare(b));

    logger.info(`Found ${responseFiles.length} response files to evaluate`);

    // Create all evaluation tasks
    interface EvaluationTask {
      responseFile: string;
      responsePath: string;
      promptPath: string;
      permutationPath: string;
      outputPath: string;
      responseContent: string;
      userPrompt: string;
      ruleContent: string;
    }

    const allTasks: EvaluationTask[] = [];

    // Prepare all tasks first
    for (const responseFile of responseFiles) {
      const responsePath = join(responsesDir, responseFile);
      const promptPath = join(syntheticPromptsDir, responseFile);
      const outputPath = join(correctionsDir, responseFile);

      // Extract permutation name from response filename (remove _N.txt suffix)
      const baseNameMatch = responseFile.match(/^(.+)_\d+\.txt$/);
      if (!baseNameMatch) {
        logger.warn(
          `Cannot parse permutation name from response file: ${responseFile} - skipping`
        );
        continue;
      }
      const permutationName = baseNameMatch[1];
      const permutationPath = join(permutationsDir, `${permutationName}.txt`);

      // Read the response content
      const responseFileContent = readTextFile(responsePath);
      if (responseFileContent === null) {
        logger.warn(`Failed to read response file: ${responsePath} - skipping`);
        continue;
      }

      // Extract the actual response (after "// Generated response:")
      const responseLines = responseFileContent.split("\n");
      const responseStartIndex = responseLines.findIndex((line) =>
        line.includes("// Generated response:")
      );
      const responseContent =
        responseStartIndex >= 0
          ? responseLines
              .slice(responseStartIndex + 1)
              .join("\n")
              .trim()
          : responseFileContent.trim();

      // Read the corresponding synthetic user prompt
      const promptFileContent = readTextFile(promptPath);
      if (promptFileContent === null) {
        logger.warn(`Failed to read prompt file: ${promptPath} - skipping`);
        continue;
      }

      // Extract the user prompt (after "// Generated response:")
      const promptLines = promptFileContent.split("\n");
      const promptStartIndex = promptLines.findIndex((line) =>
        line.includes("// Generated response:")
      );
      const userPrompt =
        promptStartIndex >= 0
          ? promptLines
              .slice(promptStartIndex + 1)
              .join("\n")
              .trim()
          : promptFileContent.trim();

      // Read the corresponding rule permutation
      const ruleFileContent = readTextFile(permutationPath);
      if (ruleFileContent === null) {
        logger.warn(
          `Failed to read permutation file: ${permutationPath} - skipping`
        );
        continue;
      }

      // Extract rule content (everything after the header comments)
      const ruleLines = ruleFileContent.split("\n");
      const ruleStartIndex = ruleLines.findIndex(
        (line) => line.trim() !== "" && !line.startsWith("//")
      );
      const ruleContent =
        ruleStartIndex >= 0
          ? ruleLines.slice(ruleStartIndex).join("\n").trim()
          : ruleFileContent.trim();

      allTasks.push({
        responseFile,
        responsePath,
        promptPath,
        permutationPath,
        outputPath,
        responseContent,
        userPrompt,
        ruleContent,
      });
    }

    logger.info(`Created ${allTasks.length} evaluation tasks`);

    // Execute tasks in parallel batches with fail-fast behavior
    let totalEvaluated = 0;
    const executeTask = async (task: EvaluationTask): Promise<boolean> => {
      logger.info(`Evaluating response: ${task.responseFile}`);

      try {
        // Prepare the service prompt by replacing placeholders
        const servicePrompt = servicePromptTemplate
          .replace(/{rules_all}/g, rulesAllContent)
          .replace(/{response}/g, task.responseContent)
          .replace(/{user_prompt}/g, task.userPrompt)
          .replace(/{rule}/g, task.ruleContent);

        // Call the service LLM to evaluate the response
        const evaluation = await callLLM(
          servicePrompt,
          "Please evaluate this response according to the criteria provided.",
          "service"
        );

        if (evaluation) {
          // Create output content with metadata
          const outputContent = [
            `// Generated evaluation`,
            `// Source response: ${task.responseFile}`,
            `// Generated at: ${new Date().toISOString()}`,
            ``,
            `// Original user prompt:`,
            ...task.userPrompt.split("\n").map((line) => `// ${line}`),
            ``,
            `// LLM response being evaluated:`,
            ...task.responseContent.split("\n").map((line) => `// ${line}`),
            ``,
            `// Rule being tested:`,
            ...task.ruleContent.split("\n").map((line) => `// ${line}`),
            ``,
            `// Service prompt used for evaluation:`,
            ...servicePrompt.split("\n").map((line) => `// ${line}`),
            ``,
            `// Evaluation result:`,
            evaluation,
          ].join("\n");

          writeTextFile(task.outputPath, outputContent);
          logger.debug(`Evaluated response: ${task.responseFile}`);
          return true;
        } else {
          logger.warn(`Failed to evaluate response: ${task.responseFile}`);
          return false;
        }
      } catch (error) {
        logger.error(`Error evaluating response ${task.responseFile}:`, error);
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

      // Count successful evaluations in this batch
      const batchSuccess = batchResults.filter(
        (result) => result.status === "fulfilled" && result.value === true
      ).length;
      const batchFailed = batchResults.filter(
        (result) => result.status === "fulfilled" && result.value === false
      ).length;
      const batchRejected = batchResults.filter(
        (result) => result.status === "rejected"
      ).length;

      totalEvaluated += batchSuccess;

      // Fail-fast: exit immediately if any tasks failed or were rejected
      if (batchFailed > 0 || batchRejected > 0) {
        const totalFailed = batchFailed + batchRejected;
        logger.error(
          `Batch failed: ${totalFailed} tasks failed. Stopping evaluation to prevent further errors.`
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
          `Evaluation stopped early. Processed: ${processedSoFar}/${allTasks.length} tasks. ${remainingTasks} tasks skipped.`
        );
        return false;
      }

      logger.info(
        `Batch completed: ${batchSuccess} successful, ${batchFailed} failed, ${batchRejected} rejected`
      );
    }

    // If we reach here, all batches completed successfully
    logger.info(
      `Successfully evaluated all ${totalEvaluated} responses from ${responseFiles.length} files`
    );

    return true;
  } catch (error) {
    logger.error("Error in evaluateSyntheticUserPromptResponses:", error);
    return false;
  }
}
