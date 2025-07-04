# Vibotron 🤖

AI System Prompt Optimization Pipeline

Vibotron is a powerful tool for systematically testing and optimizing AI system prompts through synthetic data generation, evaluation, and iterative improvement. It helps you create more effective prompts by generating test scenarios, evaluating responses, and automatically improving prompts based on failure patterns.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [LLM Configuration](#llm-configuration)
- [Complete Pipeline Order](#complete-pipeline-order)
- [Available Commands](#available-commands)
- [Project Structure](#project-structure)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)
- [Understanding Results](#understanding-results)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

Vibotron helps you optimize AI system prompts by:

1. **Generating rule permutations** from your base rules and flavor variations
2. **Creating synthetic user prompts** that test different scenarios
3. **Generating AI responses** to those prompts using your system prompt
4. **Evaluating responses** against your rules to find failures
5. **Iteratively improving** your system prompt based on evaluation feedback

## Quick Start

```bash
# Install dependencies
yarn install

# Run the complete pipeline (recommended for new users)
yarn start -c path/to/your/workspace.json grp    # Generate rule permutations
yarn start -c path/to/your/workspace.json gsup   # Generate synthetic user prompts
yarn start -c path/to/your/workspace.json ii -i 3 # Run iterative improvement

# Or run individual steps manually
yarn start -c path/to/your/workspace.json grp    # Generate rule permutations
yarn start -c path/to/your/workspace.json gsup   # Generate synthetic user prompts
yarn start -c path/to/your/workspace.json gsupr  # Generate responses
yarn start -c path/to/your/workspace.json esupr  # Evaluate responses
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd vibotron

# Install dependencies
yarn install

# Build the project
yarn build
```

## Configuration

Create a `workspace.json` file in your project directory:

```json
{
  "input": {
    "rules_common_file": "input/rules_common.txt",
    "rules_directory": "input/rules/",
    "flavors_directory": "input/flavors/",
    "service_prompts_directory": "input/service_prompts/"
  },
  "output": {
    "rules_all_file": "output/rules_all.txt",
    "rules_permutations_directory": "output/rules_permutations/",
    "synthetic_user_prompts_directory": "output/synthetic_user_prompts/",
    "synthetic_user_prompts_responses_directory": "output/synthetic_user_prompts_responses/",
    "target_system_prompt_file": "output/target_system_prompt.txt",
    "corrections_directory": "output/corrections/",
    "logs_directory": "output/logs/"
  },
  "llm": {
    "client": "openai",
    "model": "gpt-4",
    "temperature": 0.7
  }
}
```

## LLM Configuration

Before running Vibrotron, you need to configure your LLM providers by setting up API keys and models.

### Setup Steps

1. **Copy the example configuration:**

   ```bash
   cp llms.example.json llms.json
   ```

2. **Edit `llms.json` with your API keys and preferences:**

   ```json
   {
     "clients": {
       "service": {
         "apiKey": "your-openai-api-key-for-service",
         "baseURL": "https://api.openai.com/v1",
         "model": "gpt-4",
         "timeout": 30000,
         "parallelism": 2
       },
       "target": {
         "apiKey": "your-openai-api-key-for-target",
         "baseURL": "https://api.openai.com/v1",
         "model": "gpt-3.5-turbo",
         "timeout": 30000,
         "parallelism": 2
       }
     }
   }
   ```

### Understanding the Two Clients

**`service` client** - Used for Vibotron's internal operations:

- Generating synthetic user prompts
- Evaluating responses against rules
- Creating target system prompts
- Analyzing failures and corrections
- *Recommended: Use a powerful model like `gpt-4` for better evaluation quality*

**`target` client** - Used to simulate your actual AI system:

- Generating responses to synthetic user prompts
- This represents the AI system you're trying to optimize
- *Can use a different/cheaper model like `gpt-3.5-turbo` for cost efficiency*

### Configuration Options

- **`apiKey`** - Your OpenAI API key (or other provider)
- **`baseURL`** - API endpoint (change for different providers)
- **`model`** - Model to use (e.g., `gpt-4`, `gpt-3.5-turbo`, `claude-3-sonnet`)
- **`timeout`** - Request timeout in milliseconds
- **`parallelism`** - Number of concurrent requests (be mindful of rate limits)

### Using Different Providers

For **Anthropic Claude:**

```json
{
  "apiKey": "your-anthropic-api-key",
  "baseURL": "https://api.anthropic.com/v1",
  "model": "claude-3-sonnet-20240229"
}
```

For **Azure OpenAI:**

```json
{
  "apiKey": "your-azure-api-key",
  "baseURL": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "model": "gpt-4"
}
```

### LLM Setup Best Practices

- **Keep `llms.json` secure** - Never commit it to version control (it's in `.gitignore`)
- **Use environment variables** for API keys in production environments
- **Monitor costs** - Adjust `parallelism` and model choices based on your budget
- **Test with cheaper models first** - Use `gpt-3.5-turbo` for initial testing, upgrade to `gpt-4` for final optimization

### Understanding the Configuration Structure

The workspace.json configuration is designed around Vibotron's core concept of **systematic prompt testing through permutations**:

#### Why Separate Rules and Flavors?

**`rules_common_file`** - Contains your base system prompt and core rules that apply to ALL variations:

- Your AI's identity and mission
- Fundamental behavioral guidelines
- Context that never changes

**`rules_directory`** - Contains individual rule files that define specific behaviors:

- Each file represents a distinct rule set (e.g., `response-tone.txt`, `error-handling.txt`)
- These get combined with flavors to create permutations
- Example: If you have 3 rule files, each will be tested separately

**`flavors_directory`** - Contains variation files organized by levels:

- `level_0/` - Primary variation dimensions (e.g., user-type, complexity)
- `level_1/` - Secondary variation dimensions (e.g., response-length, context)
- Each level creates a new permutation dimension

#### Permutation Logic

Vibotron generates **all possible combinations** for comprehensive testing:

```text
Rules × Level 0 Flavors × Level 1 Flavors = Total Permutations
```

**Example:**

- 3 rules files (`tone.txt`, `accuracy.txt`, `formatting.txt`)
- 2 level_0 flavors (`beginner.txt`, `expert.txt`)
- 2 level_1 flavors (`brief.txt`, `detailed.txt`)
- **Total: 3 × 2 × 2 = 12 unique test scenarios**

Each permutation becomes a complete system prompt that gets tested with synthetic user interactions, allowing you to identify which combinations work best for different scenarios.

### Input Structure

```text
input/
├── rules_common.txt              # Base rules applied to all variations
├── rules/                        # Individual rule files
│   ├── rule1.txt
│   └── rule2.txt
├── flavors/                      # Flavor variations
│   ├── level_0/                  # Level 0 flavors for permutations
│   │   ├── flavor1.txt
│   │   └── flavor2.txt
│   └── level_1/                  # Level 1 flavors for permutations
│       ├── flavor3.txt
│       └── flavor4.txt
└── service_prompts/              # AI service prompts
    ├── synthetic_user_prompt_generation.txt
    ├── evaluation_correction.txt
    └── target_system_prompt_generation.txt
```

## Complete Pipeline Order

### Option 1: Automated Pipeline (Recommended)

```bash
# Generate rule permutations and synthetic user prompts first
yarn start -c workspace.json grp
yarn start -c workspace.json gsup

# Then run iterative improvement (handles remaining steps automatically)
yarn start -c workspace.json ii -i 5
```

### Option 2: Manual Step-by-Step Pipeline

```bash
# Step 1: Generate all rule permutations
yarn start -c workspace.json grp

# Step 2: Generate synthetic user prompts for each permutation
yarn start -c workspace.json gsup

# Step 3: Generate AI responses to synthetic prompts
yarn start -c workspace.json gsupr

# Step 4: Evaluate responses against rules
yarn start -c workspace.json esupr

# Step 5: Generate/improve target system prompt
yarn start -c workspace.json gtsp

# Step 6: Run iterative improvement (repeats steps 3-5 automatically)
yarn start -c workspace.json ii -i 3
```

## Available Commands

### Core Pipeline Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `generate-rules-permutations` | `grp` | Generate all combinations of rules and flavors |
| `generate-synthetic-user-prompts` | `gsup` | Create synthetic user prompts for testing |
| `generate-synthetic-user-prompt-responses` | `gsupr` | Generate AI responses to synthetic prompts |
| `evaluate-synthetic-user-prompt-responses` | `esupr` | Evaluate responses against rules |
| `generate-target-system-prompt` | `gtsp` | Generate/improve the target system prompt |
| `iterative-improvement` | `ii` | **Automated pipeline** - runs optimization (requires grp + gsup first) |

### Utility Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `clean-workspace` | `cw` | Clean all output files and directories |
| `process-rules` | `pr` | Process and validate rule files |

### Command Examples

```bash
# Generate 5 synthetic prompts per rule permutation
yarn start -c workspace.json gsup -n 5

# Run iterative improvement with 3 iterations
yarn start -c workspace.json ii -i 3

# Clean workspace before starting fresh
yarn start -c workspace.json cw

# Process and validate rules
yarn start -c workspace.json pr
```

## Project Structure

```text
vibotron/
├── src/                          # Source code
│   ├── index.ts                  # Main entry point
│   ├── generateRulesPermutations.ts
│   ├── generateSyntheticUserPrompts.ts
│   ├── generateSyntheticUserPromptResponses.ts
│   ├── evaluateSyntheticUserPromptResponses.ts
│   ├── generateTargetSystemPrompt.ts
│   ├── iterativeImprovement.ts
│   ├── cleanOutput.ts
│   ├── processRules.ts
│   ├── llmClients.ts
│   └── fileUtils.ts
├── workspace.json                # Configuration file
├── package.json
└── README.md
```

## Examples

### Example 1: Customer Support Bot

```text
input/
├── rules_common.txt              # "You are a helpful customer support agent..."
├── rules/
│   ├── response-tone.txt         # Professional, empathetic tone rules
│   └── escalation-policy.txt     # When to escalate to humans
├── flavors/
│   ├── level_0/
│   │   ├── user-type.txt         # New vs returning customers
│   │   └── issue-complexity.txt  # Simple vs complex issues
│   └── level_1/
│       └── response-length.txt   # Brief vs detailed responses
```

### Example 2: Technical Documentation Assistant

```text
input/
├── rules_common.txt              # "You help users with technical documentation..."
├── rules/
│   ├── accuracy.txt              # Factual accuracy requirements
│   └── formatting.txt            # Code formatting standards
├── flavors/
│   ├── level_0/
│   │   ├── expertise-level.txt   # Beginner vs advanced users
│   │   └── topic-area.txt        # Frontend vs backend vs DevOps
```

## Advanced Usage

### Custom LLM Configuration

```json
{
  "llm": {
    "client": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "temperature": 0.1,
    "max_tokens": 2000
  }
}
```

### Multiple Workspaces

```bash
# Work with different projects
yarn start -c projects/chatbot/workspace.json ii -i 3
yarn start -c projects/documentation/workspace.json ii -i 5
```

### Batch Processing

```bash
# Process multiple configurations
for config in configs/*.json; do
  echo "Processing $config"
  yarn start -c "$config" ii -i 3
done
```

## Understanding Results

### Success Metrics

- **Evaluation Pass Rate**: Percentage of responses that pass all rules
- **Failure Patterns**: Common types of rule violations
- **Improvement Trajectory**: How success rate improves over iterations

### Output Files

- `target_system_prompt.txt`: Your optimized system prompt
- `corrections/`: Detailed failure analysis and corrections
- `logs/`: Execution logs and debug information

### Logging System

Vibotron provides comprehensive logging to help you understand execution flow and debug issues:

#### Log Files Location

All logs are stored in the `logs_directory` specified in your workspace.json:

```text
output/logs/
├── combined.log     # All log messages (info, warnings, errors)
├── error.log        # Error messages only
├── exceptions.log   # Unhandled exceptions and stack traces
└── rejections.log   # Promise rejections and async errors
```

#### Log Levels and Content

**Combined Log** - Complete execution trace:

- Command start/completion timestamps
- File operations (read, write, delete)
- LLM API calls and responses
- Progress updates and status messages
- Performance metrics

**Error Log** - Focused troubleshooting:

- Configuration validation errors
- Missing file or directory issues
- LLM API failures and rate limiting
- Invalid JSON or file format errors
- Permission and filesystem errors

**Exceptions Log** - Technical debugging:

- Stack traces for crashes
- Unhandled promise rejections
- Code-level debugging information

#### Using Logs for Debugging

**Common Debugging Scenarios:**

1. **Pipeline failures** → Check `error.log` for specific error messages
2. **Slow performance** → Check `combined.log` for timing information
3. **LLM issues** → Look for API call logs and rate limiting messages
4. **File not found errors** → Verify paths in configuration section of logs
5. **Unexpected crashes** → Review `exceptions.log` for stack traces

**Log Analysis Tips:**

- Each command execution starts with a header: `==== Starting [command] command ====`
- Timestamps help identify timing issues between operations
- Search for "ERROR" or "WARN" to quickly find issues
- LLM API calls show token usage and model responses

## Best Practices

1. **Start Simple**: Begin with a few rules and flavors, then expand
2. **Iterative Approach**: Use 3-5 iterations for most optimization tasks
3. **Quality Over Quantity**: Focus on meaningful rule variations
4. **Regular Cleaning**: Use `cw` command to clean workspace between experiments
5. **Version Control**: Track your input files and successful prompts

## Troubleshooting

### Common Issues

#### "No synthetic user prompt responses found"

- Run `gsupr` command first or use `ii` for automatic handling

#### "Missing required configuration paths"

- Verify all paths in `workspace.json` are correct and files exist

#### "Evaluation failed"

- Check that service prompts are properly formatted
- Verify LLM configuration is correct

### Debug Mode

```bash
# Run with verbose logging
DEBUG=vibotron:* yarn start -c workspace.json ii -i 3
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE](LICENSE) file for details.

---

**Need help?** Open an issue or check the examples in the repository for more guidance.
