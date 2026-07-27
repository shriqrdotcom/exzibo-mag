/**
 * exzibo-realtime/src/env.ts — Worker environment contract
 *
 * Validates the secret bindings required by the Cloudflare Worker runtime.
 * Never logs secret values. Never generates fallback secrets.
 */

import type { Env } from "./index.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function requireNonEmptyString(value: string | undefined, name: string): string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigError(`${name} is required and must be a non-empty string`);
  }
  return value.trim();
}

export function requireSecret(value: string | undefined, name: string, minLength = 32): string {
  const v = requireNonEmptyString(value, name);
  if (v.length < minLength) {
    throw new ConfigError(`${name} must be at least ${minLength} characters`);
  }
  return v;
}

export function validateWorkerEnv(env: Env): Required<Pick<Env, "PUBLISH_SECRET" | "REALTIME_TICKET_SECRET">> {
  return {
    PUBLISH_SECRET: requireSecret(env.PUBLISH_SECRET, "PUBLISH_SECRET", 32),
    REALTIME_TICKET_SECRET: requireSecret(env.REALTIME_TICKET_SECRET, "REALTIME_TICKET_SECRET", 32),
  };
}
