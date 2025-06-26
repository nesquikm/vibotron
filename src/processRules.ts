import { readdirSync, existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { join, basename } from "path";
import { readTextFile, writeTextFile } from "./fileUtils";
import { logger } from "./initLogger";

interface RuleData {
  content: string;
  source: string;
  level?: number;
}

interface FlavorLevel {
  level: number;
  flavors: RuleData[];
}

export function processRulesAndFlavors(config: any): boolean {
  try {
    logger.info("Starting rules and flavors processing");

    // Step 0: Clear old files
    clearOldFiles(config);

    // Step 1: Read rules_common_file (required)
    const commonRules = readCommonRules(config);
    if (!commonRules) {
      logger.error("Failed to read common rules file - aborting");
      return false;
    }

    // Step 2: Read rules from rules_directory (optional)
    const rules = readRulesDirectory(config);

    // Step 3: Read flavors from all flavor level directories (optional)
    const flavorLevels = readFlavorLevels(config);

    // Step 4: Generate rules_all_file
    generateRulesAllFile(commonRules, rules, flavorLevels, config);

    // Step 5: Generate permutations
    generateRulesPermutations(commonRules, rules, flavorLevels, config);

    logger.info("Rules and flavors processing completed successfully");
    return true;
  } catch (error) {
    logger.error("Error in processRulesAndFlavors:", error);
    return false;
  }
}

function clearOldFiles(config: any): void {
  logger.info("Clearing old files");

  // Clear rules_all_file if it exists
  const rulesAllFile = config.output?.rules_all_file;
  if (rulesAllFile && existsSync(rulesAllFile)) {
    try {
      unlinkSync(rulesAllFile);
      logger.info(`Cleared old rules_all_file: ${rulesAllFile}`);
    } catch (error) {
      logger.warn(`Failed to clear rules_all_file ${rulesAllFile}:`, error);
    }
  }

  // Clear rules_permutations_directory if it exists
  const permutationsDir = config.output?.rules_permutations_directory;
  if (permutationsDir && existsSync(permutationsDir)) {
    try {
      rmSync(permutationsDir, { recursive: true, force: true });
      logger.info(`Cleared old permutations directory: ${permutationsDir}`);
    } catch (error) {
      logger.warn(
        `Failed to clear permutations directory ${permutationsDir}:`,
        error
      );
    }
  }
}

function readCommonRules(config: any): RuleData | null {
  const filePath = config.input?.rules_common_file;

  if (!filePath) {
    logger.error("rules_common_file not specified in config");
    return null;
  }

  if (!existsSync(filePath)) {
    logger.error(`Common rules file does not exist: ${filePath}`);
    return null;
  }

  logger.info(`Reading common rules from: ${filePath}`);
  const content = readTextFile(filePath);

  if (content === null) {
    return null;
  }

  return {
    content,
    source: filePath,
  };
}

function readRulesDirectory(config: any): RuleData[] {
  const rulesDir = config.input?.rules_directory;
  const rules: RuleData[] = [];

  if (!rulesDir) {
    logger.info("rules_directory not specified in config - skipping");
    return rules;
  }

  if (!existsSync(rulesDir)) {
    logger.info(`Rules directory does not exist: ${rulesDir} - skipping`);
    return rules;
  }

  logger.info(`Reading rules from directory: ${rulesDir}`);

  try {
    const files = readdirSync(rulesDir).filter((file) => file.endsWith(".txt"));

    for (const file of files) {
      const filePath = join(rulesDir, file);
      logger.info(`Reading rule file: ${filePath}`);

      const content = readTextFile(filePath);
      if (content !== null) {
        rules.push({
          content,
          source: filePath,
        });
      }
    }

    logger.info(`Successfully read ${rules.length} rule files`);
  } catch (error) {
    logger.warn(`Error reading rules directory ${rulesDir}:`, error);
  }

  return rules;
}

function readFlavorLevels(config: any): FlavorLevel[] {
  const flavorLevels: FlavorLevel[] = [];

  if (!config.input) {
    logger.info("No input config found - skipping flavors");
    return flavorLevels;
  }

  // Find all flavors_level_N_directory keys
  const flavorKeys = Object.keys(config.input)
    .filter((key) => /^flavors_level_\d+_directory$/.exec(key))
    .sort((a, b) => a.localeCompare(b)); // Sort to ensure consistent order

  for (const key of flavorKeys) {
    const match = /^flavors_level_(\d+)_directory$/.exec(key);
    if (!match) continue;

    const level = parseInt(match[1]);
    const flavorDir = config.input[key];

    logger.info(`Processing flavor level ${level} from: ${flavorDir}`);

    const flavors = readFlavorDirectory(flavorDir, level);
    if (flavors.length > 0) {
      flavorLevels.push({ level, flavors });
    }
  }

  logger.info(`Found ${flavorLevels.length} flavor levels`);
  return flavorLevels;
}

function readFlavorDirectory(flavorDir: string, level: number): RuleData[] {
  const flavors: RuleData[] = [];

  if (!existsSync(flavorDir)) {
    logger.info(
      `Flavor directory level ${level} does not exist: ${flavorDir} - skipping`
    );
    return flavors;
  }

  try {
    const files = readdirSync(flavorDir).filter((file) =>
      file.endsWith(".txt")
    );

    for (const file of files) {
      const filePath = join(flavorDir, file);
      logger.info(`Reading flavor file level ${level}: ${filePath}`);

      const content = readTextFile(filePath);
      if (content !== null) {
        flavors.push({
          content,
          source: filePath,
        });
      }
    }

    logger.info(
      `Successfully read ${flavors.length} flavor files from level ${level}`
    );
  } catch (error) {
    logger.warn(
      `Error reading flavor directory level ${level} ${flavorDir}:`,
      error
    );
  }

  return flavors;
}

function generateRulesAllFile(
  commonRules: RuleData,
  rules: RuleData[],
  flavorLevels: FlavorLevel[],
  config: any
): void {
  const outputPath = config.output?.rules_all_file;

  if (!outputPath) {
    logger.warn("rules_all_file not specified in config - skipping");
    return;
  }

  logger.info(`Generating rules_all_file: ${outputPath}`);

  // Create sources comment
  const sources = [
    `// Generated from:`,
    `// Common rules: ${commonRules.source}`,
    ...rules.map((rule) => `// Rule: ${rule.source}`),
    ...flavorLevels.flatMap((level) =>
      level.flavors.map(
        (flavor) => `// Flavor L${level.level}: ${flavor.source}`
      )
    ),
    `// Generated at: ${new Date().toISOString()}`,
    ``,
  ].join("\n");

  // Combine all content with inline comments
  const contentParts = [
    sources,
    `// Common rules from: ${commonRules.source}`,
    commonRules.content,
    ...rules.flatMap((rule) => [`// Rule from: ${rule.source}`, rule.content]),
    ...flavorLevels.flatMap((level) =>
      level.flavors.flatMap((flavor) => [
        `// Flavor L${level.level} from: ${flavor.source}`,
        flavor.content,
      ])
    ),
  ];

  const allContent = contentParts.join("\n\n");

  writeTextFile(outputPath, allContent);
}

function generateRulesPermutations(
  commonRules: RuleData,
  rules: RuleData[],
  flavorLevels: FlavorLevel[],
  config: any
): void {
  const outputDir = config.output?.rules_permutations_directory;

  if (!outputDir) {
    logger.warn(
      "rules_permutations_directory not specified in config - skipping"
    );
    return;
  }

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  logger.info(`Generating permutations in: ${outputDir}`);

  // If no rules, create one permutation with just common rules and flavors
  const rulesToProcess =
    rules.length > 0 ? rules : [{ content: "", source: "none" }];

  let permutationCount = 0;

  for (const rule of rulesToProcess) {
    // Generate all flavor combinations for this rule
    const flavorCombinations = generateFlavorCombinations(flavorLevels);

    for (const flavorCombo of flavorCombinations) {
      permutationCount++;

      // Create filename
      const ruleBasename =
        rule.source !== "none" ? basename(rule.source, ".txt") : "base";
      const flavorSuffix =
        flavorCombo.length > 0
          ? "_" +
            flavorCombo
              .map((f) => `L${f.level}_${basename(f.source, ".txt")}`)
              .join("_")
          : "";
      const filename = `${ruleBasename}${flavorSuffix}.txt`;
      const outputPath = join(outputDir, filename);

      // Create sources comment
      const sources = [
        `// Generated permutation:`,
        `// Common rules: ${commonRules.source}`,
        rule.source !== "none" ? `// Rule: ${rule.source}` : null,
        ...flavorCombo.map(
          (flavor) => `// Flavor L${flavor.level}: ${flavor.source}`
        ),
        `// Generated at: ${new Date().toISOString()}`,
        ``,
      ]
        .filter(Boolean)
        .join("\n");

      // Combine content with inline comments (excluding common rules)
      const contentParts = [
        sources,
        rule.source !== "none" ? `// Rule from: ${rule.source}` : null,
        rule.source !== "none" ? rule.content : null,
        ...flavorCombo.flatMap((flavor) => [
          `// Flavor L${flavor.level} from: ${flavor.source}`,
          flavor.content,
        ]),
      ].filter(Boolean);

      const content = contentParts.join("\n\n");

      writeTextFile(outputPath, content);
    }
  }

  logger.info(`Generated ${permutationCount} rule permutations`);
}

function generateFlavorCombinations(flavorLevels: FlavorLevel[]): RuleData[][] {
  if (flavorLevels.length === 0) {
    return [[]]; // Return one empty combination
  }

  // Sort by level to ensure consistent order
  const sortedLevels = [...flavorLevels].sort((a, b) => a.level - b.level);

  // Generate cartesian product of all flavor levels
  const combinations: RuleData[][] = [[]];

  for (const level of sortedLevels) {
    const newCombinations: RuleData[][] = [];

    for (const combination of combinations) {
      for (const flavor of level.flavors) {
        newCombinations.push([
          ...combination,
          { ...flavor, level: level.level },
        ]);
      }
    }

    combinations.splice(0, combinations.length, ...newCombinations);
  }

  // If no flavors in any level, return empty combination
  return combinations.length > 0 ? combinations : [[]];
}
