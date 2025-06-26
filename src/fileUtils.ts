import { readFileSync, writeFileSync } from "fs";
import { logger } from "./initLogger";

export function readTextFile(filePath: string): string | null {
  try {
    logger.debug(`Reading file: ${filePath}`);

    const fileContent = readFileSync(filePath, "utf8");
    const lines = fileContent.split("\n");

    // Filter out lines that start with // (comments)
    const filteredLines = lines.filter((line) => {
      const trimmedLine = line.trim();
      return !trimmedLine.startsWith("//");
    });

    const result = filteredLines.join("\n");
    logger.info(
      `Successfully read file: ${filePath}, ${lines.length} total lines, ${filteredLines.length} non-comment lines`
    );

    return result;
  } catch (error) {
    logger.error(`Failed to read file: ${filePath}`, error);
    return null;
  }
}

export function writeTextFile(filePath: string, content: string): boolean {
  try {
    logger.debug(`Writing file: ${filePath}`);

    const lines = content.split("\n");
    writeFileSync(filePath, content, "utf8");

    logger.info(
      `Successfully wrote file: ${filePath}, ${lines.length} lines written`
    );
    return true;
  } catch (error) {
    logger.error(`Failed to write file: ${filePath}`, error);
    return false;
  }
}
