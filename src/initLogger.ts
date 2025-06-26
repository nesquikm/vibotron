import winston from "winston";
import { join } from "path";

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack ?? message}`;
  })
);

// File format without colors
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack ?? message}`;
  })
);

export function createConsoleLogger(): winston.Logger {
  const logger = winston.createLogger({
    level: "info",
    transports: [
      // Console transport with colorized format
      new winston.transports.Console({
        level: "debug",
        format: consoleFormat,
      }),
    ],
  });

  return logger;
}

export function addFileTransports(
  logger: winston.Logger,
  config: any
): winston.Logger {
  // Get output directory from program options
  const logsDirectory = config.output?.logs_directory;

  if (!logsDirectory) {
    throw new Error("logs_directory not found in config");
  }

  // Create file paths
  const combinedLogPath = join(logsDirectory, "combined.log");
  const errorLogPath = join(logsDirectory, "error.log");
  const exceptionsLogPath = join(logsDirectory, "exceptions.log");
  const rejectionsLogPath = join(logsDirectory, "rejections.log");

  // Add file transports with append mode and no colors
  logger.add(
    new winston.transports.File({
      filename: combinedLogPath,
      level: "info",
      format: fileFormat,
      options: { flags: "a" }, // append mode
    })
  );

  logger.add(
    new winston.transports.File({
      filename: errorLogPath,
      level: "error",
      format: fileFormat,
      options: { flags: "a" }, // append mode
    })
  );

  // Add exception and rejection handlers
  logger.exceptions.handle(
    new winston.transports.File({
      filename: exceptionsLogPath,
      format: fileFormat,
      options: { flags: "a" }, // append mode
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: rejectionsLogPath,
      format: fileFormat,
      options: { flags: "a" }, // append mode
    })
  );

  return logger;
}

// Global logger instance
export const logger = createConsoleLogger();
