/** Preserve an optional reverse-proxy prefix without allowing a credential-bearing
 * request to replace the configured host or escape the service's /v1 endpoints. */
export function scoringServiceUrl(baseUrl: string, endpoint: string): URL {
  const base = new URL(baseUrl);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid NIQ Scoring service URL");
  if (!endpoint.startsWith("/v1/") || endpoint.includes("\\") || endpoint.includes("#")) throw new Error("Invalid NIQ Scoring endpoint");
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = `${prefix}/`;
  const result = new URL(endpoint.slice(1), base);
  if (result.origin !== base.origin || !result.pathname.startsWith(`${prefix}/v1/`)) throw new Error("Invalid NIQ Scoring endpoint");
  return result;
}
