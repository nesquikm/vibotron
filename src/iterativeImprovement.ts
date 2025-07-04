import { Command } from "commander";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { generateTargetSystemPrompt } from "./generateTargetSystemPrompt";
import { evaluateSyntheticUserPromptResponses } from "./evaluateSyntheticUserPromptResponses";
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

    if (!targetSystemPromptFile || !correctionsDir) {
      logger.error(
        "Missing required configuration paths for iterative improvement"
      );
      return false;
    }

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

    // Iterative improvement loop
    while (currentIteration < maxIterations) {
      currentIteration++;
      console.log(`\n🔄 Iteration ${currentIteration}/${maxIterations}`);

      // Step 2: Run evaluation
      console.log(
        "🔍 Running evaluation of synthetic user prompt responses..."
      );
      const evalSuccess = await evaluateSyntheticUserPromptResponses(config);
      if (!evalSuccess) {
        console.error("❌ Evaluation failed");
        return false;
      }

      // Step 3: Check for failures
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

      // Step 4: Check if we have more iterations
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

      // Step 5: Regenerate target system prompt with corrections
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
