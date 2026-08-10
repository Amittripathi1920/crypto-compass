import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  symbol: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  timeframe: z.enum(["15m", "1h", "4h", "1d"]),
  stopAtr: z.number().min(0.5).max(5).optional(),
  target1Rr: z.number().min(1).max(6).optional(),
  maxBarsHeld: z.number().int().min(5).max(120).optional(),
});

export const backtestCoin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { generateBacktest } = await import("./backtest.server");
    return generateBacktest(data);
  });
