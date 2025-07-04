import { Command } from "commander";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { generateTargetSystemPrompt } from "./generateTargetSystemPrompt";
import { evaluateSyntheticUserPromptResponses } from "./evaluateSyntheticUserPromptResponses";
import { generateSyntheticUserPromptResponses } from "./generateSyntheticUserPromptResponses";
import { readTextFile } from "./fileUtils";
import { logger } from "./initLogger";

export function iterativeImprovementCommand(
  program: Command,
  configLoader: (program: Command) => any
) {
  program
    .command("iterative-improvement")
    .alias("ii")
    .description(
      "Iteratively improve target system prompt based on evaluation failures"
    )
    .requiredOption(
      "-i, --iterations <number>",
      "Maximum number of improvement iterations",
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.error("Error: Iterations must be a positive integer");
          process.exit(1);
        }
        return num;
      }
    )
    .action(async (options) => {
      logger.info("==== Starting iterative-improvement command ====");

      const config = configLoader(program);
      const maxIterations = options.iterations;

      console.log(
        `🚀 Starting iterative improvement with maximum ${maxIterations} iterations`
      );

      const success = await runIterativeImprovement(config, maxIterations);

      if (success) {
        logger.info("Iterative improvement completed successfully");
      } else {
        logger.error("Iterative improvement failed");
        process.exit(1);
      }
    });
}

export async function runIterativeImprovement(
  config: any,
  maxIterations: number
): Promise<boolean> {
  try {
    const targetSystemPromptFile = config.output?.target_system_prompt_file;
    const correctionsDir = config.output?.corrections_directory;
    const responsesDir =
      config.output?.synthetic_user_prompts_responses_directory;
    const rulesAllFile = config.output?.rules_all_file;
    const syntheticPromptsDir = config.output?.synthetic_user_prompts_directory;

    if (
      !targetSystemPromptFile ||
      !correctionsDir ||
      !responsesDir ||
      !rulesAllFile ||
      !syntheticPromptsDir
    ) {
      logger.error(
        "Missing required configuration paths for iterative improvement"
      );
      return false;
    }

    // Check prerequisites: rules all file must exist (from grp command)
    if (!existsSync(rulesAllFile)) {
      console.error(
        "❌ Rules all file does not exist. Please run 'grp' command first:"
      );
      console.error("   yarn start -c workspace.json grp");
      logger.error(`Rules all file does not exist: ${rulesAllFile}`);
      return false;
    }

    // Check prerequisites: synthetic user prompts must exist (from gsup command)
    const syntheticPromptFiles = existsSync(syntheticPromptsDir)
      ? readdirSync(syntheticPromptsDir).filter((f) => f.endsWith(".txt"))
      : [];
    if (syntheticPromptFiles.length === 0) {
      console.error(
        "❌ No synthetic user prompts found. Please run 'gsup' command first:"
      );
      console.error("   yarn start -c workspace.json gsup");
      logger.error(
        `No synthetic user prompts found in: ${syntheticPromptsDir}`
      );
      return false;
    }

    console.log(
      `📋 Found ${syntheticPromptFiles.length} synthetic user prompts`
    );

    let currentIteration = 0;

    // Step 1: Generate initial target system prompt if it doesn't exist
    if (!existsSync(targetSystemPromptFile)) {
      console.log(
        "📝 Target system prompt not found, generating initial version..."
      );
      const success = await generateTargetSystemPrompt(config);
      if (!success) {
        console.error("❌ Failed to generate initial target system prompt");
        return false;
      }
      console.log("✅ Initial target system prompt generated");
    } else {
      console.log("📋 Using existing target system prompt");
    }

    // Step 2: Ensure synthetic user prompt responses exist
    const responseFiles = existsSync(responsesDir)
      ? readdirSync(responsesDir).filter((f) => f.endsWith(".txt"))
      : [];
    if (responseFiles.length === 0) {
      console.log(
        "📝 No synthetic user prompt responses found, generating them..."
      );
      const gsuprSuccess = await generateSyntheticUserPromptResponses(config);
      if (!gsuprSuccess) {
        console.error("❌ Failed to generate synthetic user prompt responses");
        return false;
      }
      console.log("✅ Synthetic user prompt responses generated");
    } else {
      console.log(
        `📋 Using existing ${responseFiles.length} synthetic user prompt responses`
      );
    }

    // Iterative improvement loop
    while (currentIteration < maxIterations) {
      currentIteration++;
      console.log(`\n🔄 Iteration ${currentIteration}/${maxIterations}`);

      // Step 3: Run evaluation (always run fresh evaluation each iteration)
      console.log(
        "🔍 Running evaluation of synthetic user prompt responses..."
      );
      const evalSuccess = await evaluateSyntheticUserPromptResponses(config);
      if (!evalSuccess) {
        console.error("❌ Evaluation failed");
        return false;
      }

      // Step 4: Check for failures
      const failureCount = await countEvaluationFailures(correctionsDir);
      const totalEvaluations = await countTotalEvaluations(correctionsDir);

      console.log(
        `📊 Evaluation Results: ${failureCount} failures out of ${totalEvaluations} total evaluations`
      );

      if (failureCount === 0) {
        console.log(
          `🎉 Success! No evaluation failures found after ${currentIteration} iteration(s)`
        );
        console.log("🏆 Target system prompt optimization complete!");
        return true;
      }

      console.log(`⚠️  Found ${failureCount} evaluation failures`);

      // Step 5: Check if we have more iterations
      if (currentIteration >= maxIterations) {
        console.log(`🛑 Reached maximum iterations (${maxIterations})`);
        console.log(
          `📈 Final Results: ${failureCount} failures remaining out of ${totalEvaluations} evaluations`
        );
        const successRate = (
          ((totalEvaluations - failureCount) / totalEvaluations) *
          100
        ).toFixed(1);
        console.log(`📊 Success Rate: ${successRate}%`);
        return true; // Still consider success, just didn't achieve perfect score
      }

      // Step 6: Regenerate target system prompt with corrections
      console.log(
        "🔧 Regenerating target system prompt using failure corrections..."
      );
      const regenSuccess = await generateTargetSystemPrompt(config);
      if (!regenSuccess) {
        console.error("❌ Failed to regenerate target system prompt");
        return false;
      }
      console.log("✅ Target system prompt regenerated");
    }

    return true;
  } catch (error) {
    logger.error("Error in runIterativeImprovement:", error);
    return false;
  }
}

async function countEvaluationFailures(
  correctionsDir: string
): Promise<number> {
  if (!existsSync(correctionsDir)) {
    return 0;
  }

  const correctionFiles = readdirSync(correctionsDir)
    .filter((file) => file.endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b));

  let failureCount = 0;

  for (const file of correctionFiles) {
    const filePath = join(correctionsDir, file);
    const content = readTextFile(filePath);

    if (content !== null) {
      // Look for EVALUATION: FAIL pattern
      const evaluationFailMatch = /EVALUATION:\s*FAIL/i.exec(content);
      if (evaluationFailMatch) {
        failureCount++;
      }
    }
  }

  return failureCount;
}

async function countTotalEvaluations(correctionsDir: string): Promise<number> {
  if (!existsSync(correctionsDir)) {
    return 0;
  }

  const correctionFiles = readdirSync(correctionsDir).filter((file) =>
    file.endsWith(".txt")
  );

  return correctionFiles.length;
}
