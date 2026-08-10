import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL env var is missing during drizzle config initialization.");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public", "neon_auth"],
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
