import { Command } from "commander";
import winston from "winston";
import { processRulesAndFlavors } from "./processRules";

export function generateRulesPermutationsCommand(
  program: Command,
  config: any,
  logger: winston.Logger
) {
  program
    .command("generate-rules-permutations")
    .alias("grp")
    .description("Generate rules permutations")
    .action(async () => {
      logger.info("Starting generate-rules-permutations command");

      const success = processRulesAndFlavors(config, logger);

      if (success) {
        logger.info("Rules permutations generated successfully");
      } else {
        logger.error("Failed to generate rules permutations");
        process.exit(1);
      }
    });
}
