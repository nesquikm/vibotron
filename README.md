# Vibotron 🤖

AI System Prompt Optimization Pipeline

Vibotron is a powerful tool for systematically testing and optimizing AI system prompts through synthetic data generation, evaluation, and iterative improvement. It helps you create more effective prompts by generating test scenarios, evaluating responses, and automatically improving prompts based on failure patterns.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
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
