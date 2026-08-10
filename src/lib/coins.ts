export type Timeframe = "4h" | "8h" | "1d" | "1w";

export const TIMEFRAMES: { value: Timeframe; label: string; horizon: string }[] = [
  { value: "4h", label: "4H", horizon: "swing (3-7 days)" },
  { value: "8h", label: "8H", horizon: "extended swing (5-10 days)" },
  { value: "1d", label: "1D", horizon: "position (2-6 weeks)" },
  { value: "1w", label: "1W", horizon: "long term macro (2-6 months)" },
];

export const COINS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "BNB", name: "BNB" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "XRP", name: "XRP" },
  { symbol: "ADA", name: "Cardano" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "TON", name: "Toncoin" },
  { symbol: "TRX", name: "TRON" },
  { symbol: "DOT", name: "Polkadot" },
  { symbol: "POL", name: "Polygon" },
  { symbol: "LTC", name: "Litecoin" },
  { symbol: "HYPE", name: "Hyperliquid" },
  { symbol: "BCH", name: "Bitcoin Cash" },
  { symbol: "NEAR", name: "NEAR Protocol" },
  { symbol: "UNI", name: "Uniswap" },
  { symbol: "APT", name: "Aptos" },
  { symbol: "ICP", name: "Internet Computer" },
  { symbol: "ONDO", name: "ONDO" },
  { symbol: "ATOM", name: "Cosmos" },
] as const;

export type ProviderId = "lovable" | "openai" | "anthropic" | "google" | "groq";

export const PROVIDERS: {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  defaultModel: string;
  models: string[];
  keyHint: string;
}[] = [
  {
    id: "lovable",
    label: "Lovable AI (built in)",
    needsKey: false,
    defaultModel: "google/gemini-3.6-flash",
    models: ["google/gemini-3.6-flash", "google/gemini-2.5-pro", "openai/gpt-5.4-mini"],
    keyHint: "No key needed — included with this app.",
  },
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    keyHint: "sk-... from platform.openai.com",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    defaultModel: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-haiku-latest"],
    keyHint: "sk-ant-... from console.anthropic.com",
  },
  {
    id: "google",
    label: "Google Gemini",
    needsKey: true,
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    keyHint: "API key from aistudio.google.com",
  },
  {
    id: "groq",
    label: "Groq",
    needsKey: true,
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.3-70b-specdec",
      "llama-3.1-8b-instant",
      "llama-3.1-70b-versatile",
      "llama3-70b-8192",
      "llama3-8b-8192",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "deepseek-r1-distill-llama-70b"
    ],
    keyHint: "gsk_... from console.groq.com",
  },
];

export function providerById(id: ProviderId) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}
