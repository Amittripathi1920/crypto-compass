import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  symbol: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  timeframe: z.enum(["15m", "1h", "4h", "1d"]),
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
    return fetchTicker(data.symbol);
  });
