import { describe, expect, it, vi } from "vitest";
import { MillionSend } from "../src/index.js";
import { type Captured, makeClient } from "./helper.js";

describe("construction", () => {
  it("throws without an API key and without the env var", () => {
    const prev = process.env.MILLIONSEND_API_KEY;
    delete process.env.MILLIONSEND_API_KEY;
    expect(() => new MillionSend()).toThrow(/Missing API key/);
    if (prev !== undefined) process.env.MILLIONSEND_API_KEY = prev;
  });

  it("falls back to MILLIONSEND_API_KEY", () => {
    process.env.MILLIONSEND_API_KEY = "ms_env";
    expect(() => new MillionSend()).not.toThrow();
    delete process.env.MILLIONSEND_API_KEY;
  });

  it("strips a trailing slash from the base URL", async () => {
    const calls: Captured[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push({ url: String(url), method: "GET", headers: {}, body: undefined });
      return new Response("{}", { status: 200 });
    });
    const ms = new MillionSend("ms_test", {
      baseUrl: "https://api.test/",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await ms.emails.get("e1");
    expect(calls[0]?.url).toBe("https://api.test/emails/e1");
  });
});

describe("request wiring", () => {
  it("sets Bearer auth, Accept, User-Agent and Content-Type on writes", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>" });
    const h = calls[0]?.headers ?? {};
    expect(h.Authorization).toBe("Bearer ms_test");
    expect(h.Accept).toBe("application/json");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["User-Agent"]).toMatch(/^millionsend-node\/\d/);
  });

  it("maps camelCase inputs to the snake_case wire and omits undefined", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "a@x.dev",
      to: ["b@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      replyTo: "r@x.dev",
      scheduledAt: "2999-01-01T00:00:00Z",
    });
    expect(calls[0]?.body).toEqual({
      from: "a@x.dev",
      to: ["b@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      reply_to: "r@x.dev",
      scheduled_at: "2999-01-01T00:00:00Z",
    });
  });

  it("sends Idempotency-Key on POST when provided, and only on POST", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send(
      { from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" },
      { idempotencyKey: "key-123" },
    );
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("key-123");
  });

  it("returns { data } on 2xx", async () => {
    const { ms } = makeClient({ body: { id: "abc" } });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "abc" });
  });

  it("returns a normalized error on non-2xx", async () => {
    const { ms } = makeClient({
      status: 422,
      body: { statusCode: 422, name: "validation_error", message: "bad" },
    });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ statusCode: 422, name: "validation_error", message: "bad" });
  });

  it("surfaces a transport failure as statusCode null", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const ms = new MillionSend("ms_test", {
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.data).toBeNull();
    expect(res.error?.statusCode).toBeNull();
    expect(res.error?.message).toMatch(/ECONNREFUSED/);
  });

  it("falls back to a generic error when the body is not the canonical shape", async () => {
    const { ms } = makeClient({ status: 500, body: "gateway boom" });
    const res = await ms.emails.get("e1");
    expect(res.error).toEqual({
      name: "application_error",
      message: "Request failed with status 500",
      statusCode: 500,
    });
  });
});
