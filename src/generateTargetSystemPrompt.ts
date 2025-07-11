import { Command } from "commander";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { callLLM } from "./llmClients";
import { logger } from "./initLogger";

export function generateTargetSystemPromptCommand(
  program: Command,
  configLoader: (program: Command) => any
) {
  program
    .command("generate-target-system-prompt")
    .alias("gtsp")
    .description("Generate target system prompt using rules and corrections")
    .action(async () => {
      logger.info("==== Starting generate-target-system-prompt command ====");

      const config = configLoader(program);
      const success = await generateTargetSystemPrompt(config);

      if (success) {
        logger.info("Target system prompt generated successfully");
      } else {
        logger.error("Failed to generate target system prompt");
        process.exit(1);
      }
    });
}

export async function generateTargetSystemPrompt(
  config: any
): Promise<boolean> {
  try {
    logger.info("Starting target system prompt generation");

    // Validate required config paths
    const rulesAllFile = config.output?.rules_all_file;
    const correctionsDir = config.output?.corrections_directory;
    const targetSystemPromptFile = config.output?.target_system_prompt_file;
    const servicePromptFile =
      config.service_prompts?.target_system_prompt_generation;
    const temperature = config.output?.target_system_prompt_temperature ?? 0.7;

    if (!rulesAllFile || !targetSystemPromptFile || !servicePromptFile) {
      logger.error(
        "Missing required configuration paths for target system prompt generation"
      );
      return false;
    }

    // Check if required files exist
    if (!existsSync(rulesAllFile)) {
      logger.error(`Rules all file does not exist: ${rulesAllFile}`);
      return false;
    }

    if (!existsSync(servicePromptFile)) {
      logger.error(`Service prompt file does not exist: ${servicePromptFile}`);
      return false;
    }

    // Read the rules_all content
    const rulesAllContent = readTextFile(rulesAllFile);
    if (rulesAllContent === null) {
      logger.error(`Failed to read rules all file: ${rulesAllFile}`);
      return false;
    }

    // Read corrections content (optional) - only from failed evaluations
    let correctionsContent = "";
    if (correctionsDir && existsSync(correctionsDir)) {
      logger.info(`Reading corrections from: ${correctionsDir}`);

      const correctionFiles = readdirSync(correctionsDir)
        .filter((file) => file.endsWith(".txt"))
        .sort((a, b) => a.localeCompare(b));

      if (correctionFiles.length > 0) {
        const corrections: string[] = [];
        let processedFiles = 0;
        let failedEvaluations = 0;

        for (const file of correctionFiles) {
          const filePath = join(correctionsDir, file);
          logger.debug(`Processing correction file: ${filePath}`);

          const content = readTextFile(filePath);
          if (content !== null) {
            processedFiles++;

            // Look for EVALUATION: FAIL pattern in the entire content
            const evaluationFailMatch = /EVALUATION:\s*FAIL/i.exec(content);

            if (evaluationFailMatch) {
              failedEvaluations++;

              // Extract text after CORRECTIONS: (case insensitive, multiline)
              // Capture everything after CORRECTIONS: until end of file, preserving all content including empty lines
              const correctionsMatch = /CORRECTIONS:\s*(.+)/is.exec(content);

              if (correctionsMatch) {
                const correctionText = correctionsMatch[1].trim();

                // Skip if corrections say "None needed"
                if (correctionText.toLowerCase() !== "none needed") {
                  corrections.push(correctionText);
                  logger.debug(
                    `Extracted correction from failed evaluation: ${file}`
                  );
                } else {
                  logger.debug(
                    `Skipping "None needed" correction from: ${file}`
                  );
                }
              } else {
                logger.debug(
                  `No CORRECTIONS section found in failed evaluation: ${file}`
                );
              }
            } else {
              logger.debug(`Skipping non-failed evaluation: ${file}`);
            }
          }
        }

        correctionsContent = corrections.join("\n\n");
        logger.info(
          `Processed ${processedFiles} correction files, found ${failedEvaluations} failed evaluations, extracted ${corrections.length} actionable corrections`
        );
      } else {
        logger.info("No correction files found in corrections directory");
      }
    } else {
      logger.info(
        "Corrections directory does not exist or not specified - proceeding without corrections"
      );
    }

    // Read the service prompt template
    const servicePromptTemplate = readTextFile(servicePromptFile);
    if (servicePromptTemplate === null) {
      logger.error(`Failed to read service prompt file: ${servicePromptFile}`);
      return false;
    }

    // Read existing target system prompt if it exists
    let oldSystemPrompt = "";
    logger.info(
      `Checking if target system prompt file exists: ${targetSystemPromptFile}`
    );
    if (existsSync(targetSystemPromptFile)) {
      logger.info(
        `Reading existing target system prompt from: ${targetSystemPromptFile}`
      );

      try {
        const existingContent = readFileSync(targetSystemPromptFile, "utf8");
        logger.info(
          `File content read successfully: true, length: ${existingContent.length}`
        );
        if (existingContent) {
          // Extract the actual prompt content (after the metadata comments)
          // Look for the line "// Generated target system prompt:" and take everything after it
          const lines = existingContent.split("\n");
          let foundPromptStart = false;
          const promptLines: string[] = [];

          logger.info(
            `Processing ${lines.length} lines from existing target system prompt file`
          );

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.trim() === "// Generated target system prompt:") {
              foundPromptStart = true;
              logger.info(
                `Found prompt start marker at line ${i + 1}: "${line}"`
              );
              continue;
            }

            if (foundPromptStart) {
              // Only include lines that are NOT commented out (don't start with //)
              // This ensures we get the actual generated content, not the commented service prompt
              if (!line.trim().startsWith("//")) {
                promptLines.push(line);
              } else {
                logger.debug(`Skipped commented line ${i + 1}: "${line}"`);
              }
            }
          }

          logger.info(
            `Extracted ${promptLines.length} lines of prompt content`
          );

          if (promptLines.length > 0) {
            oldSystemPrompt = promptLines.join("\n").trim();
            logger.info(
              `Extracted existing target system prompt (${oldSystemPrompt.length} characters)`
            );
          } else {
            logger.warn(
              "Could not extract prompt content from existing target system prompt file"
            );
          }
        }
      } catch (error) {
        logger.warn("Could not read existing target system prompt file", error);
      }
    } else {
      logger.info("No existing target system prompt found - starting fresh");
    }

    // Prepare the service prompt by replacing placeholders
    const servicePrompt = servicePromptTemplate
      .replace(/{rules_all}/g, rulesAllContent)
      .replace(/{all_corrections}/g, correctionsContent)
      .replace(/{old_system_prompt}/g, oldSystemPrompt);

    logger.info(
      `Generating target system prompt with temperature: ${temperature}`
    );

    // Call the service LLM to generate target system prompt
    const targetSystemPrompt = await callLLM(
      "",
      servicePrompt,
      "service",
      temperature
    );

    if (!targetSystemPrompt) {
      logger.error(
        "Failed to generate target system prompt - LLM returned no content"
      );
      return false;
    }

    // Create output content with metadata
    const outputContent = [
      `// Generated target system prompt`,
      `// Rules source: ${rulesAllFile}`,
      `// Corrections source: ${correctionsDir ?? "none"}`,
      `// Generated at: ${new Date().toISOString()}`,
      `// Temperature: ${temperature}`,
      ``,
      `// Service prompt used for generation:`,
      ...servicePrompt.split("\n").map((line) => `// ${line}`),
      ``,
      `// Generated target system prompt:`,
      targetSystemPrompt,
    ].join("\n");

    writeTextFile(targetSystemPromptFile, outputContent);
    logger.info(`Target system prompt written to: ${targetSystemPromptFile}`);
    logger.info(
      `Generated target system prompt (${targetSystemPrompt.length} characters)`
    );

    return true;
  } catch (error) {
    logger.error("Error in generateTargetSystemPrompt:", error);
    return false;
  }
}
