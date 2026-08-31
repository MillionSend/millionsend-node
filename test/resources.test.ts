import { describe, expect, it } from "vitest";
import type { ScoreBand } from "../src/index.js";
import { makeClient, pathOf } from "./helper.js";

describe("emails", () => {
  it("get and cancel hit the right paths", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.get("e1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/emails/e1" });
    await ms.emails.cancel("e1");
    expect(calls[1]).toMatchObject({ method: "POST", url: "https://api.test/emails/e1/cancel" });
  });

  it("get carries the score field, present or null", async () => {
    const { ms } = makeClient({ body: { object: "email", id: "e1", score: 7.5 } });
    const scored = await ms.emails.get("e1");
    expect(scored.data?.score).toBe(7.5);

    const { ms: unscored } = makeClient({ body: { object: "email", id: "e1", score: null } });
    const res = await unscored.emails.get("e1");
    expect(res.data?.score).toBeNull();
  });
});

describe("insights", () => {
  const fixture = {
    object: "email_insights",
    email_id: "6f1c9a1e-0000-4000-8000-000000000001",
    score: 8.5,
    score_version: 1,
    band: "excellent",
    marketing: true,
    html_size_bytes: 12345,
    computed_at: "2026-08-31T00:00:00.000Z",
    checks: [
      { id: "list_unsubscribe", severity: "major", status: "fail", penalty: 1.25,
        detail: { header: null, reason: "missing" } },
      { id: "plain_text_part", severity: "minor", status: "pass", penalty: 0 },
    ],
  };

  it("getInsights hits the path and returns the full report", async () => {
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.emails.getInsights("e1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/emails/e1/insights" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(fixture);
    expect(res.data?.checks[0]?.detail).toEqual({ header: null, reason: "missing" });
    expect(res.data?.checks[1]?.detail).toBeUndefined();
  });

  it("surfaces the 404 envelope when insights do not exist", async () => {
    const { ms } = makeClient({
      status: 404,
      body: { statusCode: 404, name: "not_found", message: "Email not found" },
    });
    const res = await ms.emails.getInsights("missing");
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ statusCode: 404, name: "not_found", message: "Email not found" });
  });

  it("tolerates unknown future band/severity/status values (open sets)", async () => {
    const { ms } = makeClient({
      body: {
        ...fixture,
        band: "stellar",
        checks: [{ id: "brand_new_check", severity: "blocker", status: "deferred", penalty: 0 }],
      },
    });
    const res = await ms.emails.getInsights("e1");
    expect(res.error).toBeNull();
    expect(res.data?.band).toBe("stellar");
    expect(res.data?.checks[0]?.status).toBe("deferred");
    // Type-level half of the guarantee: a future value assigns without error.
    const future: ScoreBand = "stellar";
    expect(future).toBe("stellar");
  });
});

describe("deliverability", () => {
  const fixture = {
    object: "deliverability",
    score: 8.7,
    band: "good",
    content_score: 8.2,
    outcome_score: 9.1,
    complaint_rate: 0.0002,
    hard_bounce_rate: 0.001,
    emails_sent: 12345,
    scored_recipients: 23456,
    window_days: 30,
    insufficient_outcome_data: false,
    guardrail_status: "ok",
    score_version: 1,
  };

  it("get hits /deliverability and returns the report", async () => {
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.deliverability.get();
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/deliverability" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(fixture);
  });

  it("passes through the null-score shape", async () => {
    const empty = {
      ...fixture,
      score: null,
      band: null,
      content_score: null,
      outcome_score: null,
      insufficient_outcome_data: true,
    };
    const { ms } = makeClient({ body: empty });
    const res = await ms.deliverability.get();
    expect(res.data).toEqual(empty);
    expect(res.data?.score).toBeNull();
    expect(res.data?.band).toBeNull();
  });
});

describe("batch", () => {
  it("sends an array body with an idempotency key", async () => {
    const { ms, calls } = makeClient({ body: { data: [{ id: "1" }, { id: "2" }] } });
    const res = await ms.batch.send(
      [
        { from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one" },
        { from: "a@x.dev", to: "c@x.dev", subject: "2", text: "two" },
      ],
      { idempotencyKey: "batch-1" },
    );
    expect(pathOf(calls[0])).toBe("/emails/batch");
    expect(Array.isArray(calls[0]?.body)).toBe(true);
    expect((calls[0]?.body as unknown[]).length).toBe(2);
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("batch-1");
    expect(res.data?.data.length).toBe(2);
  });
});

describe("contacts", () => {
  it("creates at /contacts", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.create({ email: "c@x.dev", firstName: "Ada" });
    expect(pathOf(calls[0])).toBe("/contacts");
    expect(calls[0]?.body).toEqual({ email: "c@x.dev", first_name: "Ada" });
  });

  it("addresses by string id and by email", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.get("c1");
    expect(pathOf(calls[0])).toBe("/contacts/c1");
    await ms.contacts.get({ email: "c@x.dev" });
    expect(pathOf(calls[1])).toBe(`/contacts/${encodeURIComponent("c@x.dev")}`);
  });

  it("update sends only provided keys (null clears)", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.update({ id: "c1", firstName: null, unsubscribed: true });
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "https://api.test/contacts/c1" });
    expect(calls[0]?.body).toEqual({ first_name: null, unsubscribed: true });
  });

  it("remove and list", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.remove({ email: "c@x.dev" });
    expect(calls[0]?.method).toBe("DELETE");
    await ms.contacts.list({ after: "cur" });
    expect(pathOf(calls[1])).toBe("/contacts?after=cur");
  });

  it("topics.update patches /contacts/:id/topics with the bare array", async () => {
    const { ms, calls } = makeClient({ body: { id: "c1" } });
    await ms.contacts.topics.update({
      id: "c1",
      topics: [{ id: "t1", subscription: "opt_out" }],
    });
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "https://api.test/contacts/c1/topics" });
    expect(calls[0]?.body).toEqual([{ id: "t1", subscription: "opt_out" }]);
  });
});

describe("broadcasts", () => {
  it("covers the full lifecycle", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.create({ segmentId: "s1", from: "a@x.dev", subject: "News", html: "<p>hi</p>" });
    expect(pathOf(calls[0])).toBe("/broadcasts");
    expect(calls[0]?.body).toEqual({
      segment_id: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
    });
    await ms.broadcasts.get("b1");
    expect(pathOf(calls[1])).toBe("/broadcasts/b1");
    await ms.broadcasts.list();
    expect(pathOf(calls[2])).toBe("/broadcasts");
    await ms.broadcasts.update("b1", { subject: "New" });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/broadcasts/b1" });
    await ms.broadcasts.send("b1", { scheduledAt: "2999-01-01T00:00:00Z" });
    expect(pathOf(calls[4])).toBe("/broadcasts/b1/send");
    expect(calls[4]?.body).toEqual({ scheduled_at: "2999-01-01T00:00:00Z" });
    await ms.broadcasts.cancel("b1");
    expect(pathOf(calls[5])).toBe("/broadcasts/b1/cancel");
    await ms.broadcasts.remove("b1");
    expect(calls[6]?.method).toBe("DELETE");
  });
});

describe("topics", () => {
  it("covers create/get/list/remove", async () => {
    const { ms, calls } = makeClient();
    await ms.topics.create({ name: "Product", defaultSubscription: "opt_in" });
    expect(calls[0]?.body).toEqual({ name: "Product", default_subscription: "opt_in" });
    await ms.topics.get("t1");
    expect(pathOf(calls[1])).toBe("/topics/t1");
    await ms.topics.list();
    expect(pathOf(calls[2])).toBe("/topics");
    await ms.topics.remove("t1");
    expect(calls[3]?.method).toBe("DELETE");
  });
});

describe("segments", () => {
  it("covers create/get/list/update/remove on /segments", async () => {
    const { ms, calls } = makeClient();
    const filter = { match: "all" as const, conditions: [{ field: "email", op: "is_set" }] };
    await ms.segments.create({ name: "Active", filter });
    expect(pathOf(calls[0])).toBe("/segments");
    expect(calls[0]?.body).toEqual({ name: "Active", filter });
    await ms.segments.get("s1");
    expect(pathOf(calls[1])).toBe("/segments/s1");
    await ms.segments.list({ before: "cur" });
    expect(pathOf(calls[2])).toBe("/segments?before=cur");
    await ms.segments.update("s1", { name: "Renamed" });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/segments/s1" });
    await ms.segments.remove("s1");
    expect(calls[4]?.method).toBe("DELETE");
  });
});
