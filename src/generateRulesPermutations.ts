import { Command } from "commander";
import { processRulesAndFlavors } from "./processRules";
import { logger } from "./initLogger";

export function generateRulesPermutationsCommand(program: Command, config: any) {
  program
    .command("generate-rules-permutations")
    .alias("grp")
    .description("Generate rules permutations")
    .action(async () => {
      logger.info("Starting generate-rules-permutations command");

      const success = processRulesAndFlavors(config);

      if (success) {
        logger.info("Rules permutations generated successfully");
      } else {
        logger.error("Failed to generate rules permutations");
        process.exit(1);
      }
    });
}
