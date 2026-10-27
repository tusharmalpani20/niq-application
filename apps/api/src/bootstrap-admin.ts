import { bootstrapAdminSchema } from "@niq/application-contracts";

/** Submit initial administrator JSON from stdin; never place its password in argv. */
export async function bootstrapAdministrator(
  input: string,
  environment: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<void> {
  const token = environment.BOOTSTRAP_TOKEN;
  if (!token || token.length < 32) throw new Error("Set BOOTSTRAP_TOKEN for the initial setup only.");
  let endpoint: URL;
  try {
    endpoint = new URL(environment.BOOTSTRAP_API_URL ?? "http://127.0.0.1:3000");
  } catch {
    throw new Error("Set a valid bootstrap API URL.");
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname);
  if (endpoint.username || endpoint.password || !["http:", "https:"].includes(endpoint.protocol)
    || (endpoint.protocol !== "https:" && !loopback)) {
    throw new Error("Use a loopback HTTP or HTTPS bootstrap API URL without embedded credentials.");
  }
  let payload;
  try {
    payload = bootstrapAdminSchema.parse(JSON.parse(input));
  } catch {
    // Validation errors can contain submitted values. Keep CLI output generic.
    throw new Error("Provide valid bootstrap administrator JSON on stdin.");
  }
  let response: Response;
  try {
    response = await request(new URL("/v1/bootstrap", endpoint), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", "x-bootstrap-token": token },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the bootstrap API. Check its address and availability.");
  }
  // Do not print server bodies: even an upstream proxy error may include secrets.
  if (response.status === 403) throw new Error("Bootstrap is disabled or its token does not match the API configuration.");
  if (response.status === 409) throw new Error("Bootstrap has already been completed.");
  if (response.status !== 201) throw new Error(`Bootstrap failed with HTTP ${response.status}.`);
}

if (import.meta.main) {
  try {
    if (process.stdin.isTTY) throw new Error("Redirect a protected bootstrap JSON file into stdin.");
    await bootstrapAdministrator(await Bun.stdin.text(), process.env);
    console.info("Initial administrator created. Remove BOOTSTRAP_TOKEN and restart the API. Normal sign-in is required.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Bootstrap failed.");
    process.exitCode = 1;
  }
}
