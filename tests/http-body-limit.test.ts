import express from "express";
import { describe, expect, it } from "vitest";

/** Regression: Express' 100 kB default made large base64 uploads fail with 413. */
describe("HTTP body limit", () => {
  it("accepts a 300 kB JSON body with the limit used by the server and rejects it by default", async () => {
    const big = JSON.stringify({ content: "A".repeat(300 * 1024) });
    const run = async (limit?: string) => {
      const app = express();
      app.use(limit ? express.json({ limit }) : express.json());
      app.post("/", (_req, res) => res.sendStatus(200));
      const server = app.listen(0);
      const { port } = server.address() as { port: number };
      const r = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: big,
      });
      server.close();
      return r.status;
    };
    expect(await run()).toBe(413); // Gegenprobe: ohne Limit-Anhebung scheitert es
    expect(await run("12mb")).toBe(200);
  });
});
