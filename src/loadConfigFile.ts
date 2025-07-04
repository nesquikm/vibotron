import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve, dirname, isAbsolute } from "path";

export function loadConfigFile(program: Command) {
  // Load config file after parsing arguments
  const options = program.opts();
  const configPath = options.config;

  try {
    // Check if config file exists
    if (!configPath) {
      console.error("Error: No config file path specified");
      process.exit(1);
    }

    const configData = JSON.parse(readFileSync(configPath, "utf8"));

    // Get the directory of the config file
    const configDir = dirname(resolve(configPath));

    // Resolve all paths in the config relative to the config file location
    const resolvedConfig = resolveConfigPaths(configData, configDir);

    return resolvedConfig;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(`Error: Config file not found: ${configPath}`);
      console.error("Please check the file path and try again.");
    } else if (error instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in config file: ${configPath}`);
      console.error("Please check the JSON syntax and try again.");
      console.error(`Details: ${error.message}`);
    } else {
      console.error(`Error: Failed to load config file: ${configPath}`);
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }
}

function resolveConfigPaths(config: any, configDir: string): any {
  if (typeof config === "string") {
    // If it's a string that looks like a file path
    if (isFilePath(config)) {
      // Don't resolve if it's already an absolute path
      if (isAbsolute(config)) {
        return config;
      }
      return resolve(configDir, config);
    }
    return config;
  }

  if (Array.isArray(config)) {
    return config.map((item) => resolveConfigPaths(item, configDir));
  }

  if (typeof config === "object" && config !== null) {
    const resolved: any = {};
    for (const [key, value] of Object.entries(config)) {
      resolved[key] = resolveConfigPaths(value, configDir);
    }
    return resolved;
  }

  return config;
}

function isFilePath(str: string): boolean {
  // Empty strings are not paths
  if (!str) return false;

  // Contains relative path indicators
  if (str.includes("./") || str.includes("../")) return true;

  // Ends with common file extensions
  if (/\.(txt|json|log)$/.test(str)) return true;

  // Ends with / (directory)
  if (str.endsWith("/")) return true;

  // Contains path separators and looks like a file/directory structure
  if (str.includes("/") && !str.includes(" ")) return true;

  // Starts with common directory indicators
  if (str.startsWith("./") || str.startsWith("../") || str.startsWith("/"))
    return true;

  return false;
}
