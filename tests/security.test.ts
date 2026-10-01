import { test } from "node:test";
import assert from "node:assert/strict";
import { isCrossSite, json } from "../netlify/lib/http.ts";

const req = (method: string, headers: Record<string, string>) => new Request("https://artistroom.example/api/admin/x", { method, headers });

test("cross-site state-changing requests are detected", () => {
  assert.equal(isCrossSite(req("POST", { origin: "https://evil.example" })), true);
  assert.equal(isCrossSite(req("POST", { "sec-fetch-site": "cross-site" })), true);
  assert.equal(isCrossSite(req("DELETE", { "sec-fetch-site": "same-site" })), true);
  assert.equal(isCrossSite(req("POST", { origin: "https://artistroom.example", "sec-fetch-site": "same-origin" })), false);
  assert.equal(isCrossSite(req("GET", { origin: "https://evil.example" })), false);
  assert.equal(isCrossSite(req("POST", {})), false); // non-browser caller, no cookies
});

test("API responses carry security headers", () => {
  const h = json({ ok: true }).headers;
  assert.equal(h.get("cache-control"), "no-store");
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.match(h.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});
