import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  symbol: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  timeframe: z.enum(["4h", "8h", "1d", "1w"]),
  provider: z.enum(["lovable", "openai", "anthropic", "google", "groq"]),
  model: z.string().max(80).optional(),
  apiKey: z.string().max(300).optional(),
});

export const analyzeCoin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { generateSignal } = await import("./signal.server");
    return generateSignal(data);
  });

export const getLivePrice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[A-Z0-9]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchTicker } = await import("./market.server");
    const res = await fetchTicker(data.symbol);
    return { ...res.value, source: res.source };
  });

export const getPatternAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[A-Z0-9]+$/),
        timeframe: z.enum(["4h", "8h", "1d", "1w"]),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { generatePatternAnalysis } = await import("./signal.server");
    return generatePatternAnalysis(data.symbol, data.timeframe);
  });
