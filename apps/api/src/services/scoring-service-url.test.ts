import { expect, test } from "bun:test";
import { scoringServiceUrl } from "./scoring-service-url";

test.each([
  ["https://scoring.example.test", "https://scoring.example.test/v1/activate"],
  ["https://scoring.example.test/", "https://scoring.example.test/v1/activate"],
  ["https://scoring.example.test/api", "https://scoring.example.test/api/v1/activate"],
  ["https://scoring.example.test/api/", "https://scoring.example.test/api/v1/activate"],
  ["http://127.0.0.1:4000/api/", "http://127.0.0.1:4000/api/v1/activate"],
])("Scoring URL %s retains its configured gateway prefix", (base, expected) => {
  expect(String(scoringServiceUrl(base, "/v1/activate"))).toBe(expected);
});
test("supports endpoint query parameters without changing the configured host", () => {
  expect(String(scoringServiceUrl("https://scoring.example.test/api", "/v1/face-scans/scan?organizationReference=org"))).toBe("https://scoring.example.test/api/v1/face-scans/scan?organizationReference=org");
});
test.each(["ftp://scoring.example.test", "https://user:password@scoring.example.test", "https://scoring.example.test/api?key=secret", "https://scoring.example.test/api#fragment"])("rejects unsafe base URL %s", base => {
  expect(() => scoringServiceUrl(base, "/v1/activate")).toThrow();
});
test.each(["https://other.example.test/v1/activate", "//other.example.test/v1/activate", "/admin/activate", "/v1/../../admin", "/v1/%2e%2e/admin", "/v1/\\other.example.test", "/v1/activate#fragment"])("rejects endpoint escape %s", endpoint => {
  expect(() => scoringServiceUrl("https://scoring.example.test/api/", endpoint)).toThrow();
});
