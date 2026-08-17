import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env["DATABASE_URL"];

export const db = databaseUrl
  ? drizzle(neon(databaseUrl), { schema })
  : new Proxy({} as NeonHttpDatabase<typeof schema>, {
      get(target, prop) {
        throw new Error(
          "DATABASE_URL environment variable is missing! Please configure it in your Vercel project settings.",
        );
      },
    });

export * from "./schema";
