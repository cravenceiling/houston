export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  cliName: string;
  installUrl: string;
  loginCommand: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "Codex",
    cliName: "codex",
    installUrl: "https://github.com/openai/codex",
    loginCommand: "codex login",
    cost: "Your ChatGPT subscription",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4", description: "Flagship. Best reasoning and tool use." },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Faster and cheaper for lighter tasks." },
      { id: "gpt-5.3-codex", label: "Codex", description: "Purpose-built for coding agents." },
    ],
    defaultModel: "gpt-5.4",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    subtitle: "Claude Code",
    cliName: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    loginCommand: "claude login",
    cost: "Your Claude subscription",
    models: [
      { id: "sonnet", label: "Sonnet", description: "Best balance of speed and quality." },
      { id: "opus", label: "Opus", description: "Most capable. Slower, more tokens." },
      { id: "haiku", label: "Haiku", description: "Fastest and cheapest for simple tasks." },
    ],
    defaultModel: "sonnet",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    subtitle: "AI Subscription",
    cliName: "opencode",
    installUrl: "https://opencode.ai/docs/cli",
    loginCommand: "opencode auth login --provider opencode-go",
    cost: "$5/mo first month, then $10/mo",
    models: [
      { id: "opencode-go/glm-5.1", label: "GLM-5.1", description: "Most capable. Best reasoning." },
      { id: "opencode-go/glm-5", label: "GLM-5", description: "Strong reasoning and tool use." },
      { id: "opencode-go/kimi-k2.6", label: "Kimi K2.6", description: "Advanced comprehension." },
      { id: "opencode-go/kimi-k2.5", label: "Kimi K2.5", description: "Balanced performance." },
      { id: "opencode-go/mimo-v2.5-pro", label: "MiMo-V2.5-Pro", description: "Professional coding agent." },
      { id: "opencode-go/mimo-v2.5", label: "MiMo-V2.5", description: "Efficient coding assistant." },
      { id: "opencode-go/minimax-m2.7", label: "MiniMax M2.7", description: "Latest MiniMax model." },
      { id: "opencode-go/minimax-m2.5", label: "MiniMax M2.5", description: "Cost-effective MiniMax." },
      { id: "opencode-go/qwen3.6-plus", label: "Qwen3.6 Plus", description: "Latest Qwen model." },
      { id: "opencode-go/qwen3.5-plus", label: "Qwen3.5 Plus", description: "Strong general model." },
      { id: "opencode-go/deepseek-v4-pro", label: "DeepSeek V4 Pro", description: "Deep coding specialist." },
      { id: "opencode-go/deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "Fast DeepSeek model." },
    ],
    defaultModel: "opencode-go/glm-5.1",
  },
] as const;

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Find the model object for a provider + model id. */
export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/** Get the default provider + model for a provider id. */
export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "sonnet";
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  { id: "gemini", name: "Google", subtitle: "Gemini CLI", mark: "G" },
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
