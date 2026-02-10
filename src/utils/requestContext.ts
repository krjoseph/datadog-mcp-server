import { AsyncLocalStorage } from "async_hooks";

export interface DatadogCredentials {
  apiKey?: string;
  appKey?: string;
}

export interface RequestContext {
  credentials: DatadogCredentials;
  /** Optional per-request DD site override (e.g. "datadoghq.eu") */
  ddHost?: string;
}

// AsyncLocalStorage to maintain request context across async operations
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get credentials from the current request context
 * Falls back to environment variables if not in HTTP mode
 */
export function getCredentials(): DatadogCredentials {
  const context = requestContext.getStore();
  
  if (context) {
    return context.credentials;
  }
  
  // Fallback to environment variables (for stdio mode)
  return {
    apiKey: process.env.DD_API_KEY,
    appKey: process.env.DD_APP_KEY
  };
}

/**
 * Validate that required credentials are present
 */
export function validateCredentials(credentials: DatadogCredentials): void {
  if (!credentials.apiKey) {
    throw new Error("DD_API_KEY is required. Provide via X-DD-API-Key header or environment variable.");
  }
  
  if (!credentials.appKey) {
    throw new Error("DD_APP_KEY is required. Provide via Authorization Bearer header or environment variable.");
  }
}

/**
 * Get the raw DD site (domain without "api." prefix).
 * Used by the Datadog SDK which adds the prefix itself.
 * Priority: X-DD-Host header > service-specific env var > DD_SITE env var > default
 */
export function getDdSite(service?: "logs" | "metrics"): string {
  const context = requestContext.getStore();
  const headerSite = context?.ddHost;

  if (headerSite) {
    return headerSite;
  }

  // Fallback to service-specific env var, then DD_SITE, then default
  if (service === "logs" && process.env.DD_LOGS_SITE) {
    return process.env.DD_LOGS_SITE;
  }
  if (service === "metrics" && process.env.DD_METRICS_SITE) {
    return process.env.DD_METRICS_SITE;
  }

  return process.env.DD_SITE || "datadoghq.com";
}

/**
 * Get the full API base URL for raw fetch calls.
 * Returns "https://api.<site>" so callers can append the path directly.
 * Priority: X-DD-Host header > service-specific env var > DD_SITE env var > default
 */
export function getDdApiBaseUrl(service?: "logs" | "metrics"): string {
  const site = getDdSite(service);

  // If the site already starts with "api.", use as-is
  if (site.startsWith("api.")) {
    return `https://${site}`;
  }

  return `https://api.${site}`;
}
