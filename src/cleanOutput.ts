import { Command } from "commander";
import { existsSync, rmSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { logger, addFileTransports } from "./initLogger";

export function cleanOutputCommand(program: Command, config: any) {
  program
    .command("clean-workspace")
    .alias("cw")
    .description("Clean all workspace output files and directories")
    .action(async () => {
      logger.info("==== Starting clean-workspace command ====");

      const success = await cleanOutput(config);

      if (success) {
        logger.info("Workspace output cleaned successfully");
      } else {
        logger.error("Failed to clean workspace output");
        process.exit(1);
      }
    });
}

async function cleanOutput(config: any): Promise<boolean> {
  try {
    if (!config.output) {
      logger.error("No output configuration found");
      return false;
    }

    const outputConfig = config.output;

    // Close file transports before cleaning logs directory
    logger.info("Closing file transports before cleaning");

    // Clean individual files
    const filesToClean = [
      outputConfig.rules_all_file,
      outputConfig.target_system_prompt_file,
    ];

    for (const file of filesToClean) {
      if (file && existsSync(file)) {
        console.log(`Removing file: ${file}`);
        rmSync(file, { force: true });
      }
    }

    // Clean directories (except logs - we'll handle that separately)
    const directoriesToClean = [
      outputConfig.rules_permutations_directory,
      outputConfig.synthetic_user_prompts_directory,
      outputConfig.synthetic_user_prompts_responses_directory,
      outputConfig.corrections_directory,
    ];

    for (const dir of directoriesToClean) {
      if (dir && existsSync(dir)) {
        console.log(`Removing directory: ${dir}`);
        rmSync(dir, { recursive: true, force: true });
      }
    }

    // Force remove logs directory using child process to avoid winston file handle issues
    const logsDir = outputConfig.logs_directory;
    if (logsDir && existsSync(logsDir)) {
      console.log(`Force removing logs directory: ${logsDir}`);
      await new Promise<void>((resolve, reject) => {
        const rm = spawn("rm", ["-rf", logsDir]);
        rm.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(`Failed to remove logs directory, exit code: ${code}`)
            );
          }
        });
      });
    }

    // Recreate essential directories
    const directoriesToRecreate = [
      outputConfig.rules_permutations_directory,
      outputConfig.synthetic_user_prompts_directory,
      outputConfig.synthetic_user_prompts_responses_directory,
      outputConfig.corrections_directory,
      outputConfig.logs_directory,
    ];

    for (const dir of directoriesToRecreate) {
      if (dir) {
        console.log(`Recreating directory: ${dir}`);
        mkdirSync(dir, { recursive: true });
      }
    }

    // Re-add file transports after cleaning
    try {
      addFileTransports(logger, config);
      logger.info("File transports re-added after cleaning");
    } catch (error) {
      console.log("Could not re-enable file logging:", error);
    }

    console.log("Workspace output cleaned and recreated successfully");
    console.log("Process will exit to ensure all file handles are released.");

    // Exit the process to ensure winston file handles are released
    // This allows the logs directory to be fully cleaned
    process.exit(0);
  } catch (error) {
    console.log("Error cleaning workspace output:", error);
    return false;
  }
}
