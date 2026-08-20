import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  CHROMA_URL: z.string().url(),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  MODEL_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    DATABASE_URL: env.DATABASE_URL,
    REDIS_URL: env.REDIS_URL ?? "redis://localhost:6379",
    CHROMA_URL: env.CHROMA_URL ?? "http://localhost:8000",
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    MODEL_PROVIDER: env.MODEL_PROVIDER,
    PORT: env.PORT,
    HOST: env.HOST,
  });
}

export const config = loadConfig();