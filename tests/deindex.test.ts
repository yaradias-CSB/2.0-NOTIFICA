import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const rootDir = process.cwd();

test("index.html configures noindex for search engines", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"/i);
  assert.match(html, /<meta\s+name="googlebot"\s+content="[^"]*noindex[^"]*"/i);
});

test("robots.txt allows crawling so search engines can read noindex and exposes no sitemap", () => {
  const robots = fs.readFileSync(path.join(rootDir, "public", "robots.txt"), "utf8");
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Allow:\s*\//i);
  assert.doesNotMatch(robots, /Disallow:\s*\//i);
  assert.doesNotMatch(robots, /Sitemap:/i);
  assert.equal(fs.existsSync(path.join(rootDir, "public", "sitemap.xml")), false);
});

test("vercel.json sets X-Robots-Tag header and preserves API/SPA rewrites", () => {
  const raw = fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8");
  const config = JSON.parse(raw) as {
    rewrites?: Array<{ source: string; destination: string }>;
    headers?: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
  };

  const xRobotsRule = (config.headers || []).find((entry) =>
    entry.headers.some(
      (header) =>
        header.key.toLowerCase() === "x-robots-tag" &&
        /noindex/i.test(header.value)
    )
  );
  assert.ok(xRobotsRule, "vercel.json must configure X-Robots-Tag with noindex");
  assert.ok(
    (config.rewrites || []).some((r) => r.source === "/api/:path*"),
    "vercel.json must preserve API rewrite"
  );
  assert.ok(
    (config.rewrites || []).some((r) => r.destination === "/index.html"),
    "vercel.json must preserve SPA fallback rewrite"
  );
});

test("visual reference screenshots directory is removed", () => {
  assert.equal(
    fs.existsSync(path.join(rootDir, "public", "assets", "aistudio")),
    false
  );
});

test("Express app emits X-Robots-Tag without relaxing API auth", async () => {
  const { default: app } = await import("../server.ts");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Unexpected server address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    const res = await fetch(`${baseUrl}/api/pendencias`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get("x-robots-tag") || "", /noindex/i);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
});
