import OpenAI from "openai";
import { existsSync } from "fs";
import { readTextFile } from "./fileUtils";
import { logger } from "./initLogger";

interface LLMClientConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeout?: number;
  parallelism?: number;
}

interface LLMConfig {
  clients: {
    service: LLMClientConfig;
    target: LLMClientConfig;
  };
}

interface LLMClients {
  service: OpenAI;
  target: OpenAI;
}

let llmClients: LLMClients | null = null;
let llmConfig: LLMConfig | null = null;

export function initializeLLMClients(config: any): boolean {
  try {
    const llmConfigFile = config.llms?.config_file;

    if (!llmConfigFile) {
      logger.warn(
        "No llms.config_file specified in config - LLM clients not available"
      );
      return false;
    }

    if (!existsSync(llmConfigFile)) {
      logger.warn(
        `LLM config file does not exist: ${llmConfigFile} - LLM clients not available`
      );
      return false;
    }

    logger.info(`Reading LLM config from: ${llmConfigFile}`);

    const configContent = readTextFile(llmConfigFile);
    if (configContent === null) {
      logger.error("Failed to read LLM config file");
      return false;
    }

    try {
      llmConfig = JSON.parse(configContent) as LLMConfig;
    } catch (parseError) {
      logger.error("Failed to parse LLM config JSON:", parseError);
      return false;
    }

    // Validate config structure
    if (
      !llmConfig.clients?.service?.apiKey ||
      !llmConfig.clients?.target?.apiKey
    ) {
      logger.error(
        "LLM config missing required service or target client configuration"
      );
      return false;
    }

    if (
      !llmConfig.clients?.service?.model ||
      !llmConfig.clients?.target?.model
    ) {
      logger.error(
        "LLM config missing required model specification for service or target client"
      );
      return false;
    }

    // Create OpenAI clients
    const serviceClient = new OpenAI({
      apiKey: llmConfig.clients.service.apiKey,
      baseURL: llmConfig.clients.service.baseURL,
      timeout: llmConfig.clients.service.timeout ?? 30000,
    });

    const targetClient = new OpenAI({
      apiKey: llmConfig.clients.target.apiKey,
      baseURL: llmConfig.clients.target.baseURL,
      timeout: llmConfig.clients.target.timeout ?? 30000,
    });

    llmClients = {
      service: serviceClient,
      target: targetClient,
    };

    logger.info("LLM clients initialized successfully");
    return true;
  } catch (error) {
    logger.error("Error initializing LLM clients:", error);
    return false;
  }
}

export async function callLLM(
  instructions: string,
  input: string,
  type: "service" | "target",
  temperature?: number,
  retries: number = 2
): Promise<string | null> {
  if (!llmClients) {
    logger.error(
      "LLM clients not initialized. Call initializeLLMClients() first."
    );
    return null;
  }

  if (!llmConfig) {
    logger.error("LLM config not loaded");
    return null;
  }

  try {
    const client = llmClients[type];
    const model = llmConfig.clients[type].model;

    logger.info(`Calling ${type} LLM with model: ${model}`);
    logger.debug(`Instructions: ${instructions.substring(0, 100)}...`);
    logger.debug(`Input: ${input.substring(0, 100)}...`);

    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: instructions,
        },
        {
          role: "user",
          content: input,
        },
      ],
      temperature: temperature,
    });

    const result = response.choices[0]?.message?.content;

    if (!result) {
      logger.error(`No response content from ${type} LLM`);
      return null;
    }

    logger.info(
      `Successfully received response from ${type} LLM (${result.length} characters)`
    );
    return result;
  } catch (error: any) {
    // Handle different types of errors with appropriate logging
    if (error?.status === 429 && retries > 0) {
      const delay = Math.random() * 2000 + 1000; // Random delay 1-3 seconds
      logger.warn(
        `Rate limit exceeded for ${type} LLM (429). Retrying in ${Math.round(
          delay
        )}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callLLM(instructions, input, type, temperature, retries - 1);
    } else if (error?.status === 429) {
      logger.error(
        `Rate limit exceeded for ${type} LLM (429). No retries left. Consider reducing parallelism.`
      );
    } else if (error?.status) {
      logger.error(
        `HTTP ${error.status} error calling ${type} LLM: ${
          error.message ?? "Unknown error"
        }`
      );
    } else {
      logger.error(`Error calling ${type} LLM: ${error?.message ?? error}`);
    }

    // Log additional error details in debug mode
    if (error?.response?.data) {
      logger.debug(`Error response data:`, error.response.data);
    }

    return null;
  }
}

export function getLLMClients(): LLMClients | null {
  return llmClients;
}

export function getLLMConfig(): LLMConfig | null {
  return llmConfig;
}

export function isLLMClientsInitialized(): boolean {
  return llmClients !== null;
}
