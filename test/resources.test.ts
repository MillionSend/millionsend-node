import { describe, expect, it } from "vitest";
import type { DomainSendingMode, ScoreBand } from "../src/index.js";
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
      {
        id: "list_unsubscribe",
        severity: "major",
        status: "fail",
        penalty: 1.25,
        detail: { header: null, reason: "missing" },
      },
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
    expect(res.error).toEqual({
      statusCode: 404,
      name: "not_found",
      message: "Email not found",
      retryAfter: null,
    });
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
    expect(calls[0]?.body).toHaveLength(2);
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
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c%40x.dev",
    });
    await ms.contacts.list({ after: "cur" });
    expect(pathOf(calls[1])).toBe("/contacts?after=cur");
  });

  it("remove sends ?erase=true only when asked", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.remove("c1", { erase: true });
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c1?erase=true",
    });
    await ms.contacts.remove("c1", { erase: false });
    expect(pathOf(calls[1])).toBe("/contacts/c1");
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

  it("topics.list gets /contacts/:email/topics (encoded) and decodes the list envelope", async () => {
    const list = {
      object: "list",
      has_more: false,
      data: [
        { id: "t1", name: "Insights", description: null, subscription: "opt_in", explicit: false },
        { id: "t2", name: "Deals", description: "Offers", subscription: "opt_out", explicit: true },
      ],
    };
    const { ms, calls } = makeClient({ body: list });
    const res = await ms.contacts.topics.list({ email: "c+1@x.dev" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/contacts/c%2B1%40x.dev/topics",
      body: undefined,
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(list);
    expect(res.data?.data[1]?.explicit).toBe(true);

    await ms.contacts.topics.list({ id: "c1" });
    expect(pathOf(calls[1])).toBe("/contacts/c1/topics");
  });

  it("preferencesLink posts to /contacts/:id/preferences-link with no body, by id or email", async () => {
    const { ms, calls } = makeClient({
      body: { object: "preferences_link", contact: "c1", url: "https://app.test/unsubscribe/tok" },
    });
    const res = await ms.contacts.preferencesLink("c1");
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/c1/preferences-link",
      body: undefined,
    });
    expect(res.data?.url).toBe("https://app.test/unsubscribe/tok");
    await ms.contacts.preferencesLink({ email: "c+1@x.dev" });
    expect(pathOf(calls[1])).toBe("/contacts/c%2B1%40x.dev/preferences-link");
  });

  it("list passes include as a comma-separated facet list", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.list({ limit: 100, include: ["properties", "topics"] });
    expect(decodeURIComponent(pathOf(calls[0]))).toBe(
      "/contacts?limit=100&include=properties,topics",
    );
    await ms.contacts.list({ segmentId: "s1", include: ["topics"] });
    expect(decodeURIComponent(pathOf(calls[1]))).toBe("/segments/s1/contacts?include=topics");
  });

  it("batch.get posts ids and emails to /contacts/batch/get and returns the missing entries", async () => {
    const { ms, calls } = makeClient({
      body: {
        object: "list",
        data: [{ object: "contact", id: "c1", email: "a@x.dev" }],
        missing: [{ index: 1, email: "b@x.dev" }],
      },
    });
    const res = await ms.contacts.batch.get(["c1", { email: "b@x.dev" }], {
      include: ["properties", "topics"],
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/contacts/batch/get" });
    expect(calls[0]?.body).toEqual({
      contacts: [{ id: "c1" }, { email: "b@x.dev" }],
      include: ["properties", "topics"],
    });
    expect(res.data?.missing).toEqual([{ index: 1, email: "b@x.dev" }]);
    await ms.contacts.batch.get([{ id: "c2" }]);
    expect(calls[1]?.body).toEqual({ contacts: [{ id: "c2" }], include: undefined });
  });

  it("batch.remove posts ids or emails to /contacts/batch/remove", async () => {
    const { ms, calls } = makeClient({
      body: { data: [{ object: "contact", contact: "c1", deleted: true }] },
    });
    const res = await ms.contacts.batch.remove({ ids: ["c1", "c2"] });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/batch/remove",
    });
    expect(calls[0]?.body).toEqual({ ids: ["c1", "c2"] });
    expect(res.data?.data[0]).toEqual({ object: "contact", contact: "c1", deleted: true });
    await ms.contacts.batch.remove({ emails: ["a@x.dev"] });
    expect(calls[1]?.body).toEqual({ emails: ["a@x.dev"] });
    await ms.contacts.batch.remove({ emails: ["a@x.dev"], erase: true });
    expect(calls[2]?.body).toEqual({ emails: ["a@x.dev"], erase: true });
  });
});

describe("broadcasts", () => {
  it("covers the full lifecycle", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.create({
      segmentId: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
    });
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
    const list = { object: "list", data: [{ id: "t1", name: "Product" }], has_more: false };
    const { ms, calls } = makeClient({ body: list });
    await ms.topics.create({ name: "Product", defaultSubscription: "opt_in" });
    expect(calls[0]?.body).toEqual({ name: "Product", default_subscription: "opt_in" });
    await ms.topics.get("t1");
    expect(pathOf(calls[1])).toBe("/topics/t1");
    const listed = await ms.topics.list();
    expect(pathOf(calls[2])).toBe("/topics");
    expect(listed.data).toEqual(list);
    expect(listed.data?.has_more).toBe(false);
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

describe("emails: every field reaches the wire", () => {
  it("send puts the full payload on the wire, snake_cased, nothing dropped", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "Acme <a@x.dev>",
      to: ["b@x.dev", "b2@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      text: "h",
      cc: "c@x.dev",
      bcc: ["d@x.dev"],
      replyTo: ["r@x.dev"],
      scheduledAt: "2999-01-01T00:00:00Z",
      tags: [{ name: "campaign", value: "launch" }],
      topicId: "11111111-1111-4111-8111-111111111111",
      attachments: [
        {
          filename: "hi.txt",
          content: "aGk=",
          contentType: "text/plain",
          contentId: "hi-1",
          path: "https://x.dev/hi.txt",
        },
      ],
      headers: { "X-Entity-Ref-ID": "123" },
      template: { id: "tpl_1", variables: { name: "Ada" } },
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/emails" });
    expect(calls[0]?.body).toEqual({
      from: "Acme <a@x.dev>",
      to: ["b@x.dev", "b2@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      text: "h",
      cc: "c@x.dev",
      bcc: ["d@x.dev"],
      reply_to: ["r@x.dev"],
      scheduled_at: "2999-01-01T00:00:00Z",
      tags: [{ name: "campaign", value: "launch" }],
      topic_id: "11111111-1111-4111-8111-111111111111",
      attachments: [
        {
          filename: "hi.txt",
          content: "aGk=",
          content_type: "text/plain",
          content_id: "hi-1",
          path: "https://x.dev/hi.txt",
        },
      ],
      headers: { "X-Entity-Ref-ID": "123" },
      template: { id: "tpl_1", variables: { name: "Ada" } },
    });
  });

  it("base64-encodes Buffer attachment content and passes topic_id null through", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "a@x.dev",
      to: "b@x.dev",
      subject: "s",
      text: "t",
      topicId: null,
      attachments: [{ filename: "hi.txt", content: Buffer.from("hi") }],
    });
    expect(calls[0]?.body).toEqual({
      from: "a@x.dev",
      to: "b@x.dev",
      subject: "s",
      text: "t",
      topic_id: null,
      attachments: [{ filename: "hi.txt", content: "aGk=" }],
    });
  });

  it("list, update and remove hit the right paths", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.emails.list({ limit: 10, after: "e1" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/emails?limit=10&after=e1",
    });
    await ms.emails.update({ id: "e1", scheduledAt: "2999-01-01T00:00:00Z" });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/emails/e1" });
    expect(calls[1]?.body).toEqual({ scheduled_at: "2999-01-01T00:00:00Z" });
    await ms.emails.remove("e1");
    expect(calls[2]).toMatchObject({ method: "DELETE", url: "https://api.test/emails/e1" });
    expect(calls[2]?.body).toBeUndefined();
  });
});

describe("batch validation", () => {
  const two = [
    { from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one" },
    { from: "a@x.dev", to: "not-an-email", subject: "2", text: "two" },
  ];

  it("sends x-batch-validation and surfaces the permissive-mode errors", async () => {
    const { ms, calls } = makeClient({
      body: { data: [{ id: "1" }], errors: [{ index: 1, message: "to: invalid email" }] },
    });
    const res = await ms.batch.send(two, { batchValidation: "permissive", idempotencyKey: "b-1" });
    expect(calls[0]?.headers["x-batch-validation"]).toBe("permissive");
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("b-1");
    expect(res.data?.data).toEqual([{ id: "1" }]);
    expect(res.data?.errors).toEqual([{ index: 1, message: "to: invalid email" }]);
  });

  it("omits the header when no mode is chosen (API default is strict)", async () => {
    const { ms, calls } = makeClient({ body: { data: [{ id: "1" }, { id: "2" }] } });
    const res = await ms.batch.create(two);
    expect(calls[0]?.headers["x-batch-validation"]).toBeUndefined();
    expect(res.data?.errors).toBeUndefined();
  });
});

describe("contacts: segments, topics and batch", () => {
  it("create passes segments and topics", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.create({
      email: "c@x.dev",
      firstName: "Ada",
      lastName: "L",
      unsubscribed: false,
      properties: { plan: "pro", seats: 3 },
      segments: [{ id: "s1" }],
      topics: [{ id: "t1", subscription: "opt_in" }],
    });
    expect(calls[0]?.body).toEqual({
      email: "c@x.dev",
      first_name: "Ada",
      last_name: "L",
      unsubscribed: false,
      properties: { plan: "pro", seats: 3 },
      segments: [{ id: "s1" }],
      topics: [{ id: "t1", subscription: "opt_in" }],
    });
  });

  it("batch.create sends on_conflict, the validation header and the mapped items", async () => {
    const response = {
      data: [{ object: "contact", index: 0, id: "c1", status: "created" }],
      counts: { created: 1, updated: 0, skipped: 0, failed: 1 },
      errors: [{ index: 1, statusCode: 422, name: "validation_error", message: "email: invalid" }],
    };
    const { ms, calls } = makeClient({ body: response });
    const res = await ms.contacts.batch.create(
      [
        { email: "a@x.dev", firstName: "A" },
        { email: "nope", topics: [{ id: "t1", subscription: "opt_out" }] },
      ],
      { onConflict: "upsert", batchValidation: "permissive" },
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/batch?on_conflict=upsert",
    });
    expect(calls[0]?.headers["x-batch-validation"]).toBe("permissive");
    expect(calls[0]?.body).toEqual([
      { email: "a@x.dev", first_name: "A" },
      { email: "nope", topics: [{ id: "t1", subscription: "opt_out" }] },
    ]);
    expect(res.data).toEqual(response);
    expect(res.data?.counts.failed).toBe(1);
    expect(res.data?.errors?.[0]?.name).toBe("validation_error");
  });

  it("batch.create without options sends no query and no header", async () => {
    const { ms, calls } = makeClient({ body: { data: [], counts: {} } });
    await ms.contacts.batch.create([{ email: "a@x.dev" }]);
    expect(pathOf(calls[0])).toBe("/contacts/batch");
    expect(calls[0]?.headers["x-batch-validation"]).toBeUndefined();
  });

  it("segments.add/remove address the contact by email, id or contactId", async () => {
    const { ms, calls } = makeClient({ body: { id: "c1" } });
    await ms.contacts.segments.add({ id: "c1", segmentId: "s1" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/c1/segments/s1",
    });
    expect(calls[0]?.body).toBeUndefined();
    await ms.contacts.segments.remove({ email: "c@x.dev", segmentId: "s1" });
    expect(calls[1]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c%40x.dev/segments/s1",
    });
    await ms.contacts.segments.add({ contactId: "c2", segmentId: "s1" });
    expect(pathOf(calls[2])).toBe("/contacts/c2/segments/s1");
  });

  it("list with segmentId reads /segments/:id/contacts", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.contacts.list({ segmentId: "s1", limit: 5 });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/segments/s1/contacts?limit=5",
    });
  });

  it("get returns the typed property objects the API sends", async () => {
    const { ms } = makeClient({
      body: {
        object: "contact",
        id: "c1",
        email: "c@x.dev",
        first_name: null,
        last_name: null,
        created_at: "2026-01-01T00:00:00.000Z",
        unsubscribed: false,
        properties: { plan: { type: "string", value: "pro" }, seats: { type: "number", value: 3 } },
      },
    });
    const res = await ms.contacts.get("c1");
    expect(res.data?.properties.plan).toEqual({ type: "string", value: "pro" });
    expect(res.data?.properties.seats).toEqual({ type: "number", value: 3 });
  });
});

describe("broadcasts: full body and null clears", () => {
  it("create sends preview_text, send and scheduled_at", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.create({
      name: "Launch",
      segmentId: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
      text: "hi",
      replyTo: "r@x.dev",
      previewText: "Preheader",
      topicId: "t1",
      send: true,
      scheduledAt: "in 1 hour",
    });
    expect(calls[0]?.body).toEqual({
      name: "Launch",
      segment_id: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
      text: "hi",
      reply_to: "r@x.dev",
      preview_text: "Preheader",
      topic_id: "t1",
      send: true,
      scheduled_at: "in 1 hour",
    });
  });

  it("update sends topic_id null to clear the topic", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.update("b1", { topicId: null, previewText: "p" });
    expect(calls[0]?.body).toEqual({ topic_id: null, preview_text: "p" });
  });
});

describe("topics: visibility and update", () => {
  it("create passes visibility; update patches /topics/:id", async () => {
    const { ms, calls } = makeClient();
    await ms.topics.create({
      name: "Product",
      defaultSubscription: "opt_in",
      visibility: "public",
    });
    expect(calls[0]?.body).toEqual({
      name: "Product",
      default_subscription: "opt_in",
      visibility: "public",
    });
    await ms.topics.update("t1", { name: "Renamed", visibility: "private" });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/topics/t1" });
    expect(calls[1]?.body).toEqual({ name: "Renamed", visibility: "private" });
  });
});

describe("suppressions", () => {
  it("add/create post the email and origin", async () => {
    const { ms, calls } = makeClient({ body: { object: "suppression", id: "sup1" } });
    await ms.suppressions.add({ email: "Bad@x.dev", origin: "manual" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/suppressions" });
    expect(calls[0]?.body).toEqual({ email: "Bad@x.dev", origin: "manual" });
    await ms.suppressions.create({ email: "bad@x.dev" });
    expect(calls[1]?.body).toEqual({ email: "bad@x.dev" });
  });

  it("list filters by origin alongside the cursor", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.suppressions.list({ limit: 5, origin: "bounce" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/suppressions?limit=5&origin=bounce",
    });
    await ms.suppressions.list();
    expect(pathOf(calls[1])).toBe("/suppressions");
  });

  it("get and remove accept an id or an email", async () => {
    const { ms, calls } = makeClient();
    await ms.suppressions.get("sup1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/suppressions/sup1" });
    await ms.suppressions.remove("bad@x.dev");
    expect(calls[1]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/suppressions/bad%40x.dev",
    });
  });

  it("batch.add and batch.remove post to the batch paths", async () => {
    const { ms, calls } = makeClient({ body: { data: [] } });
    await ms.suppressions.batch.add({ emails: ["a@x.dev", "b@x.dev"], origin: "unsubscribe" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/suppressions/batch/add",
    });
    expect(calls[0]?.body).toEqual({ emails: ["a@x.dev", "b@x.dev"], origin: "unsubscribe" });
    await ms.suppressions.batch.remove({ ids: ["sup1"] });
    expect(calls[1]).toMatchObject({
      method: "POST",
      url: "https://api.test/suppressions/batch/remove",
    });
    expect(calls[1]?.body).toEqual({ ids: ["sup1"] });
    await ms.suppressions.batch.remove({ emails: ["a@x.dev"] });
    expect(calls[2]?.body).toEqual({ emails: ["a@x.dev"] });
  });
});

describe("domains", () => {
  it("create sends every field snake_cased", async () => {
    const { ms, calls } = makeClient();
    await ms.domains.create({
      name: "acme.dev",
      region: "us-east-1",
      customReturnPath: "bounce",
      openTracking: true,
      clickTracking: false,
      trackingSubdomain: "links",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/domains" });
    expect(calls[0]?.body).toEqual({
      name: "acme.dev",
      region: "us-east-1",
      custom_return_path: "bounce",
      open_tracking: true,
      click_tracking: false,
      tracking_subdomain: "links",
    });
  });

  it("list, get, verify, update and remove", async () => {
    const { ms, calls } = makeClient();
    await ms.domains.list({ limit: 2 });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/domains?limit=2" });
    await ms.domains.get("d1");
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/domains/d1" });
    await ms.domains.verify("d1");
    expect(calls[2]).toMatchObject({ method: "POST", url: "https://api.test/domains/d1/verify" });
    await ms.domains.update({
      id: "d1",
      openTracking: true,
      clickTracking: true,
      trackingSubdomain: null,
      tls: "enforced",
      capabilities: { sending: "enabled" },
    });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/domains/d1" });
    expect(calls[3]?.body).toEqual({
      open_tracking: true,
      click_tracking: true,
      tracking_subdomain: null,
      tls: "enforced",
      capabilities: { sending: "enabled" },
    });
    await ms.domains.remove("d1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/domains/d1" });
  });
});

describe("webhooks", () => {
  it("covers create/list/get/update/remove", async () => {
    const { ms, calls } = makeClient({
      body: { object: "webhook", id: "w1", signing_secret: "whsec_abc" },
    });
    const created = await ms.webhooks.create({
      endpoint: "https://x.dev/hook",
      events: ["email.sent", "email.bounced"],
      signingSecret: "whsec_abc",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/webhooks" });
    expect(calls[0]?.body).toEqual({
      endpoint: "https://x.dev/hook",
      events: ["email.sent", "email.bounced"],
      signing_secret: "whsec_abc",
    });
    expect(created.data?.signing_secret).toBe("whsec_abc");
    await ms.webhooks.list({ after: "w0" });
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/webhooks?after=w0" });
    const got = await ms.webhooks.get("w1");
    expect(calls[2]).toMatchObject({ method: "GET", url: "https://api.test/webhooks/w1" });
    expect(got.data?.signing_secret).toBe("whsec_abc");
    await ms.webhooks.update("w1", { status: "disabled", events: ["email.opened"] });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/webhooks/w1" });
    expect(calls[3]?.body).toEqual({ events: ["email.opened"], status: "disabled" });
    await ms.webhooks.remove("w1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/webhooks/w1" });
  });

  it("rotate posts to /webhooks/:id/rotate, sending {} when no option is given", async () => {
    const { ms, calls } = makeClient({
      body: {
        object: "webhook",
        id: "w1",
        signing_secret: "whsec_new",
        previous_secret_expires_at: "2026-01-02T00:00:00.000Z",
      },
    });
    const res = await ms.webhooks.rotate("w1");
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/webhooks/w1/rotate" });
    expect(calls[0]?.body).toEqual({});
    expect(res.data?.signing_secret).toBe("whsec_new");
    expect(res.data?.previous_secret_expires_at).toBe("2026-01-02T00:00:00.000Z");
    await ms.webhooks.rotate("w1", { signingSecret: "whsec_mine", overlapHours: 0 });
    expect(calls[1]?.body).toEqual({ signing_secret: "whsec_mine", overlap_hours: 0 });
  });
});

describe("apiKeys", () => {
  it("create returns the token once; list and remove", async () => {
    const { ms, calls } = makeClient({ body: { id: "k1", token: "ms_secret" } });
    const res = await ms.apiKeys.create({
      name: "ci",
      permission: "sending_access",
      domainId: "d1",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/api-keys" });
    expect(calls[0]?.body).toEqual({ name: "ci", permission: "sending_access", domain_id: "d1" });
    expect(res.data?.token).toBe("ms_secret");
    await ms.apiKeys.create({ name: "resend-shaped", domain_id: "d2" });
    expect(calls[1]?.body).toEqual({ name: "resend-shaped", domain_id: "d2" });
    await ms.apiKeys.list({ limit: 1 });
    expect(calls[2]).toMatchObject({ method: "GET", url: "https://api.test/api-keys?limit=1" });
    await ms.apiKeys.remove("k1");
    expect(calls[3]).toMatchObject({ method: "DELETE", url: "https://api.test/api-keys/k1" });
  });
});

describe("templates", () => {
  it("create sends every field; null clears alias/subject/text on update", async () => {
    const { ms, calls } = makeClient({ body: { object: "template", id: "tp1" } });
    await ms.templates.create({
      name: "Welcome",
      html: "<p>Hi</p>",
      subject: "Welcome!",
      text: "Hi",
      alias: "welcome",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/templates" });
    expect(calls[0]?.body).toEqual({
      name: "Welcome",
      html: "<p>Hi</p>",
      subject: "Welcome!",
      text: "Hi",
      alias: "welcome",
    });
    await ms.templates.update("welcome", {
      alias: null,
      subject: null,
      text: null,
      html: "<p>Yo</p>",
    });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/templates/welcome" });
    expect(calls[1]?.body).toEqual({ html: "<p>Yo</p>", subject: null, text: null, alias: null });
  });

  it("passes from/replyTo/variables through unchanged (the API decides)", async () => {
    const { ms, calls } = makeClient();
    await ms.templates.create({
      name: "n",
      html: "<p/>",
      from: "a@x.dev",
      replyTo: ["r@x.dev"],
      variables: [],
    });
    expect(calls[0]?.body).toEqual({
      name: "n",
      html: "<p/>",
      from: "a@x.dev",
      reply_to: ["r@x.dev"],
      variables: [],
    });
  });

  it("list, get by alias, publish, duplicate and remove", async () => {
    const { ms, calls } = makeClient();
    await ms.templates.list({ before: "tp0" });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/templates?before=tp0" });
    await ms.templates.get("welcome");
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/templates/welcome" });
    await ms.templates.publish("tp1");
    expect(calls[2]).toMatchObject({
      method: "POST",
      url: "https://api.test/templates/tp1/publish",
    });
    await ms.templates.duplicate("tp1");
    expect(calls[3]).toMatchObject({
      method: "POST",
      url: "https://api.test/templates/tp1/duplicate",
    });
    await ms.templates.remove("tp1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/templates/tp1" });
  });
});

describe("contactProperties", () => {
  it("covers create/list/get/update/remove, with null clearing the fallback", async () => {
    const { ms, calls } = makeClient({ body: { object: "contact_property", id: "p1" } });
    await ms.contactProperties.create({ key: "plan", type: "string", fallbackValue: "free" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/contact-properties" });
    expect(calls[0]?.body).toEqual({ key: "plan", type: "string", fallback_value: "free" });
    await ms.contactProperties.list({ limit: 3 });
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: "https://api.test/contact-properties?limit=3",
    });
    await ms.contactProperties.get("p1");
    expect(calls[2]).toMatchObject({
      method: "GET",
      url: "https://api.test/contact-properties/p1",
    });
    await ms.contactProperties.update({ id: "p1", fallbackValue: null });
    expect(calls[3]).toMatchObject({
      method: "PATCH",
      url: "https://api.test/contact-properties/p1",
    });
    expect(calls[3]?.body).toEqual({ fallback_value: null });
    await ms.contactProperties.remove("p1");
    expect(calls[4]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contact-properties/p1",
    });
  });
});

describe("usage", () => {
  it("get reads /usage and returns the report", async () => {
    const fixture = {
      object: "usage",
      cloud: true,
      plan: "pro",
      limits: { emails_per_day: 50000, domains: 10 },
      today: { emails_sent: 120, resets_at: "2026-09-05T00:00:00.000Z" },
      team: { id: "team1", name: "Acme" },
      app_url: "https://app.millionsend.com",
    };
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.usage.get();
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/usage" });
    expect(res.data).toEqual(fixture);
  });
});

// ---- receiving and inboxes ------------------------------------------------
const INBOX_ID = "6f1c9a1e-0000-4000-8000-0000000000a1";
const THREAD_ID = "6f1c9a1e-0000-4000-8000-0000000000b1";
const EMAIL_ID = "6f1c9a1e-0000-4000-8000-0000000000c1";
const DRAFT_ID = "6f1c9a1e-0000-4000-8000-0000000000d1";
/** The team's shared subdomain, and one of its own domains. */
const DOMAIN_ID = "6f1c9a1e-0000-4000-8000-0000000000e1";
const OWN_DOMAIN_ID = "6f1c9a1e-0000-4000-8000-0000000000e2";

const INBOX = {
  object: "inbox",
  id: INBOX_ID,
  name: "Signup bot",
  email_address: "signup-bot-7f3k@acme.agents.example.com",
  domain_id: DOMAIN_ID,
  receiving_address: null,
  from_name: null,
  unread: 1,
  drafts: 0,
  last_received: "2026-10-12T10:05:00.000Z",
  created_at: "2026-10-12T10:00:00.000Z",
  kind: "agent",
  shared: true,
  expires_at: null,
  quarantined: 0,
  pending_approval: 0,
};

const DRAFT = {
  object: "inbox_draft",
  id: DRAFT_ID,
  type: "reply",
  to: ["success@simulator.amazonses.com"],
  cc: [],
  bcc: [],
  subject: "Re: Confirm your email",
  html: null,
  text: "Thanks, confirmed.",
  thread_id: THREAD_ID,
  reply_to_email_id: EMAIL_ID,
  email_id: null,
  created_at: "2026-10-12T10:06:00.000Z",
  updated_at: "2026-10-12T10:06:00.000Z",
  status: "pending_approval",
  approval_reasons: ["send_policy"],
  forward: false,
  decided_by: null,
  decided_at: null,
  expires_at: "2026-10-19T10:06:00.000Z",
};

const SENT_EMAIL = {
  id: EMAIL_ID,
  direction: "outbound",
  from: "signup-bot-7f3k@acme.agents.example.com",
  to: ["success@simulator.amazonses.com"],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: "Re: Confirm your email",
  message_id: null,
  html: null,
  text: "Thanks, confirmed.",
  attachments: [],
  read: true,
  received_at: "2026-10-12T10:06:00.000Z",
  email_id: EMAIL_ID,
  thread_id: THREAD_ID,
  inbox_id: INBOX_ID,
  status: "queued",
};

describe("emails.receiving", () => {
  it("list maps every filter to the wire; flags read as true/false", async () => {
    const { ms, calls } = makeClient({
      body: { object: "list", has_more: false, data: [], held: [] },
    });
    const res = await ms.emails.receiving.list({
      limit: 10,
      before: EMAIL_ID,
      wait: 30,
      since: "2026-10-12T10:00:00Z",
      inboxId: INBOX_ID,
      to: "bot@acme.dev",
      from: "example.com",
      subjectContains: "code",
      unread: false,
      includeQuarantined: true,
      quarantined: false,
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(calls[0]?.method).toBe("GET");
    expect(url.pathname).toBe("/emails/receiving");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "10",
      before: EMAIL_ID,
      wait: "30",
      since: "2026-10-12T10:00:00Z",
      inbox_id: INBOX_ID,
      to: "bot@acme.dev",
      from: "example.com",
      subject_contains: "code",
      unread: "false",
      include_quarantined: "true",
    });
    expect(res.data?.held).toEqual([]);

    await ms.emails.receiving.list();
    expect(pathOf(calls[1])).toBe("/emails/receiving");
  });

  it("unread goes out without inboxId, for an inbox-scoped key", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", has_more: false, data: [] } });
    await ms.emails.receiving.list({ unread: false });
    expect(pathOf(calls[0])).toBe("/emails/receiving?unread=false");
  });

  it("an unknown inboxId is a 404 not_found, even with wait", async () => {
    const notFound = { statusCode: 404, name: "not_found", message: "Inbox not found." };
    const { ms } = makeClient({ status: 404, body: notFound });
    const res = await ms.emails.receiving.list({ inboxId: INBOX_ID, wait: 30 });
    expect(res).toEqual({ data: null, error: { ...notFound, retryAfter: null } });
  });

  it("get passes html_format and keeps the extension fields", async () => {
    const detail = {
      object: "email",
      id: EMAIL_ID,
      extracted_text: "Your verification code is 482913",
      extracted: {
        kinds: ["code"],
        code: "482913",
        link: null,
        link_domain_matches_sender: null,
        ambiguous: false,
      },
      screening: {
        verdict: "clean",
        sender_trust: "external",
        quarantine_reason: null,
        reasons: [],
        injection_score: 2,
        phishing_score: null,
        hidden_text_removed: false,
      },
      future_field: { nested: true },
    };
    const { ms, calls } = makeClient({ body: detail });
    const res = await ms.emails.receiving.get(EMAIL_ID, { htmlFormat: "cid" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/emails/receiving/${EMAIL_ID}?html_format=cid`,
    });
    expect(res.data).toEqual(detail);
    expect(res.data?.extracted?.code).toBe("482913");

    await ms.emails.receiving.get(EMAIL_ID);
    expect(pathOf(calls[1])).toBe(`/emails/receiving/${EMAIL_ID}`);
  });

  it("reply sends the snake_case body with an Idempotency-Key and reads 200 as sent", async () => {
    const sent = { object: "email", id: EMAIL_ID, thread_id: THREAD_ID, inbox_id: INBOX_ID };
    const { ms, calls } = makeClient({ body: sent });
    const res = await ms.emails.receiving.reply(
      EMAIL_ID,
      {
        text: "Thanks, confirmed.",
        html: "<p>Thanks</p>",
        subject: "Re: hi",
        cc: "ops@acme.dev",
        bcc: ["audit@acme.dev"],
        replyAll: true,
        requiresApproval: false,
        from: "bot@acme.dev",
        inboxId: INBOX_ID,
      },
      { idempotencyKey: "reply-1" },
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `https://api.test/emails/receiving/${EMAIL_ID}/reply`,
    });
    expect(calls[0]?.body).toEqual({
      text: "Thanks, confirmed.",
      html: "<p>Thanks</p>",
      subject: "Re: hi",
      cc: "ops@acme.dev",
      bcc: ["audit@acme.dev"],
      reply_all: true,
      requires_approval: false,
      from: "bot@acme.dev",
      inbox_id: INBOX_ID,
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("reply-1");
    expect(res).toEqual({ data: { kind: "sent", email: sent }, error: null });
  });

  it("a 202 answer is the draft held for approval", async () => {
    const { ms } = makeClient({ status: 202, body: DRAFT });
    const res = await ms.emails.receiving.reply(EMAIL_ID, { text: "hi" });
    expect(res.error).toBeNull();
    if (res.data?.kind !== "draft") throw new Error("expected a draft");
    expect(res.data.draft).toEqual(DRAFT);
    expect(res.data.draft.approval_reasons).toEqual(["send_policy"]);
  });

  it("forward sends to, mode and the note; errors pass through", async () => {
    const { ms, calls } = makeClient({
      body: { object: "email", id: EMAIL_ID, thread_id: null, inbox_id: null },
    });
    const res = await ms.emails.receiving.forward(
      EMAIL_ID,
      { to: ["ops@acme.dev"], text: "FYI", mode: "attachment", requiresApproval: true },
      { idempotencyKey: "fwd-1" },
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `https://api.test/emails/receiving/${EMAIL_ID}/forward`,
    });
    expect(calls[0]?.body).toEqual({
      to: ["ops@acme.dev"],
      text: "FYI",
      mode: "attachment",
      requires_approval: true,
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("fwd-1");
    expect(res.data?.kind).toBe("sent");

    const quarantined = {
      statusCode: 403,
      name: "email_quarantined",
      message: "This email is quarantined; a person can release it in the dashboard",
    };
    const { ms: refused } = makeClient({ status: 403, body: quarantined });
    const err = await refused.emails.receiving.forward(EMAIL_ID, { to: "ops@acme.dev" });
    expect(err).toEqual({ data: null, error: { ...quarantined, retryAfter: null } });
  });

  it("remove erases; attachments list and get", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.receiving.remove(EMAIL_ID);
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: `https://api.test/emails/receiving/${EMAIL_ID}`,
    });
    await ms.emails.receiving.attachments.list(EMAIL_ID, { limit: 5 });
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: `https://api.test/emails/receiving/${EMAIL_ID}/attachments?limit=5`,
    });
    await ms.emails.receiving.attachments.get(EMAIL_ID, "att-1");
    expect(calls[2]).toMatchObject({
      method: "GET",
      url: `https://api.test/emails/receiving/${EMAIL_ID}/attachments/att-1`,
    });
  });
});

describe("inboxes", () => {
  it("create maps every field, safety included; no argument sends {}", async () => {
    const { ms, calls } = makeClient({ status: 201, body: INBOX });
    const res = await ms.inboxes.create({
      emailAddress: "support@acme.dev",
      name: "Support",
      fromName: "Acme Support",
      forwarding: false,
      kind: "human",
      expiresIn: null,
      safety: {
        acceptFrom: "allowlist",
        allowlist: ["*@acme.dev"],
        ownerAddresses: ["ops@acme.dev"],
        screening: false,
        extractCodes: true,
        sendPolicy: "allowlist",
        requireApproval: true,
        privateCodes: false,
        sendCap: null,
        forwardTo: ["ops@acme.dev"],
      },
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/inboxes" });
    expect(calls[0]?.body).toEqual({
      email_address: "support@acme.dev",
      name: "Support",
      from_name: "Acme Support",
      forwarding: false,
      kind: "human",
      expires_in: null,
      safety: {
        accept_from: "allowlist",
        allowlist: ["*@acme.dev"],
        owner_addresses: ["ops@acme.dev"],
        screening: false,
        extract_codes: true,
        send_policy: "allowlist",
        require_approval: true,
        private_codes: false,
        send_cap: null,
        forward_to: ["ops@acme.dev"],
      },
    });
    expect(res.data).toEqual(INBOX);

    await ms.inboxes.create();
    expect(calls[1]?.body).toEqual({});
  });

  it("create sends username and domain_id only when given", async () => {
    const { ms, calls } = makeClient({ status: 201, body: INBOX });
    await ms.inboxes.create({ username: "ada" });
    expect(calls[0]?.body).toEqual({ username: "ada" });
    await ms.inboxes.create({ domainId: DOMAIN_ID });
    expect(calls[1]?.body).toEqual({ domain_id: DOMAIN_ID });
    await ms.inboxes.create({ domainId: OWN_DOMAIN_ID, username: "support" });
    expect(calls[2]?.body).toEqual({ domain_id: OWN_DOMAIN_ID, username: "support" });
  });

  it("a name review that can't run is a 503 name_review_unavailable with retryAfter", async () => {
    const unavailable = {
      statusCode: 503,
      name: "name_review_unavailable",
      message: "This name couldn't be reviewed right now: try again shortly",
    };
    const { ms } = makeClient({ status: 503, body: unavailable, headers: { "retry-after": "60" } });
    expect(await ms.inboxes.create({ username: "ada" })).toEqual({
      data: null,
      error: { ...unavailable, retryAfter: 60 },
    });
  });

  it("list, get by address, update and remove", async () => {
    const { ms, calls } = makeClient({ body: INBOX });
    await ms.inboxes.list({ limit: 2, after: INBOX_ID, kind: "agent" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes?limit=2&after=${INBOX_ID}&kind=agent`,
    });
    await ms.inboxes.get("Support@acme.dev");
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: "https://api.test/inboxes/Support%40acme.dev",
    });
    await ms.inboxes.update(INBOX_ID, { name: "Bot", fromName: "", expiresIn: "7d" });
    expect(calls[2]).toMatchObject({
      method: "PATCH",
      url: `https://api.test/inboxes/${INBOX_ID}`,
    });
    expect(calls[2]?.body).toEqual({ name: "Bot", from_name: "", expires_in: "7d" });
    await ms.inboxes.remove(INBOX_ID);
    expect(calls[3]).toMatchObject({
      method: "DELETE",
      url: `https://api.test/inboxes/${INBOX_ID}`,
    });
  });

  it("tolerates unknown keys and enum values", async () => {
    const future = { ...INBOX, kind: "team", brand_new: [1, 2] };
    const { ms } = makeClient({ body: future });
    const res = await ms.inboxes.get(INBOX_ID);
    expect(res.data).toEqual(future);
    expect(res.data?.kind).toBe("team");
  });

  it("safety get and partial update", async () => {
    const { ms, calls } = makeClient({ body: { object: "inbox_safety", inbox_id: INBOX_ID } });
    await ms.inboxes.safety.get(INBOX_ID);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes/${INBOX_ID}/safety`,
    });
    await ms.inboxes.safety.update(INBOX_ID, { sendCap: 25, acceptFrom: "verified" });
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      url: `https://api.test/inboxes/${INBOX_ID}/safety`,
    });
    expect(calls[1]?.body).toEqual({ accept_from: "verified", send_cap: 25 });
  });

  it("codes.latest maps from, wait, max_age and since", async () => {
    const found = {
      object: "verification_code",
      status: "found",
      kind: "otp",
      code: "482913",
      url: null,
      link_domain_matches_sender: null,
      email_id: EMAIL_ID,
      from: "hello@example.com",
      received_at: "2026-10-12T10:05:00.000Z",
      sender_trust: "external",
    };
    const { ms, calls } = makeClient({ body: found });
    const res = await ms.inboxes.codes.latest(INBOX_ID, {
      from: "example.com",
      wait: 20,
      maxAge: 600,
    });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes/${INBOX_ID}/codes/latest?from=example.com&wait=20&max_age=600`,
    });
    expect(res.data).toEqual(found);
    await ms.inboxes.codes.latest(INBOX_ID);
    expect(pathOf(calls[1])).toBe(`/inboxes/${INBOX_ID}/codes/latest`);
    await ms.inboxes.codes.latest(INBOX_ID, { since: "2026-10-16T12:00:00.000Z" });
    const url = new URL(calls[2]?.url ?? "");
    expect(Object.fromEntries(url.searchParams)).toEqual({ since: "2026-10-16T12:00:00.000Z" });
  });

  it("quarantine list and release", async () => {
    const release = {
      object: "inbox_release",
      inbox_id: INBOX_ID,
      email_id: EMAIL_ID,
      released_at: "2026-10-12T10:07:00.000Z",
      trusted_sender: "hello@example.com",
    };
    const { ms, calls } = makeClient({ body: release });
    await ms.inboxes.quarantine.list(INBOX_ID, { limit: 3 });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes/${INBOX_ID}/quarantine?limit=3`,
    });
    const res = await ms.inboxes.quarantine.release(INBOX_ID, EMAIL_ID, { trustSender: true });
    expect(calls[1]).toMatchObject({
      method: "POST",
      url: `https://api.test/inboxes/${INBOX_ID}/quarantine/${EMAIL_ID}/release`,
    });
    expect(calls[1]?.body).toEqual({ trust_sender: true });
    expect(res.data).toEqual(release);
    await ms.inboxes.quarantine.release(INBOX_ID, EMAIL_ID);
    expect(calls[2]?.body).toEqual({});
  });

  it("labels list, create, update and remove", async () => {
    const { ms, calls } = makeClient({ body: { object: "inbox_label", id: "l1" } });
    await ms.inboxes.labels.list(INBOX_ID);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes/${INBOX_ID}/labels`,
    });
    await ms.inboxes.labels.create(INBOX_ID, { name: "Billing", color: "#FF8800" });
    expect(calls[1]).toMatchObject({
      method: "POST",
      url: `https://api.test/inboxes/${INBOX_ID}/labels`,
    });
    expect(calls[1]?.body).toEqual({ name: "Billing", color: "#FF8800" });
    await ms.inboxes.labels.update(INBOX_ID, "l1", { name: "Invoices" });
    expect(calls[2]).toMatchObject({
      method: "PATCH",
      url: `https://api.test/inboxes/${INBOX_ID}/labels/l1`,
    });
    expect(calls[2]?.body).toEqual({ name: "Invoices" });
    await ms.inboxes.labels.remove(INBOX_ID, "l1");
    expect(calls[3]).toMatchObject({
      method: "DELETE",
      url: `https://api.test/inboxes/${INBOX_ID}/labels/l1`,
    });
  });

  it("threads list and search send lists as CSV and drop empty ones", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", has_more: false, data: [] } });
    await ms.inboxes.threads.list(INBOX_ID, {
      folders: ["inbox", "archive"],
      labels: [],
      read: false,
      includeQuarantined: true,
      limit: 20,
    });
    const listed = new URL(calls[0]?.url ?? "");
    expect(listed.pathname).toBe(`/inboxes/${INBOX_ID}/threads`);
    expect(Object.fromEntries(listed.searchParams)).toEqual({
      limit: "20",
      folders: "inbox,archive",
      read: "false",
      include_quarantined: "true",
    });

    await ms.inboxes.threads.search(INBOX_ID, {
      query: '"invoice 42" -spam',
      from: ["ada", "example.com"],
      to: ["bot@acme.dev"],
      cc: ["ops"],
      bcc: ["audit"],
      hasAttachment: true,
      startDate: "2026-10-01",
      endDate: "2026-10-12",
      labels: ["l1", "l2"],
    });
    const searched = new URL(calls[1]?.url ?? "");
    expect(searched.pathname).toBe(`/inboxes/${INBOX_ID}/threads/search`);
    expect(Object.fromEntries(searched.searchParams)).toEqual({
      labels: "l1,l2",
      query: '"invoice 42" -spam',
      from: "ada,example.com",
      to: "bot@acme.dev",
      cc: "ops",
      bcc: "audit",
      has_attachment: "true",
      start_date: "2026-10-01",
      end_date: "2026-10-12",
    });

    await ms.inboxes.threads.list(INBOX_ID);
    expect(pathOf(calls[2])).toBe(`/inboxes/${INBOX_ID}/threads`);
  });

  it("thread items carry quarantined only when the API sends it", async () => {
    const item = {
      id: THREAD_ID,
      subject: "Confirm your email",
      from: "Acme <hello@example.com>",
      to: ["signup-bot-7f3k@acme.agents.example.com"],
      cc: [],
      bcc: [],
      labels: [],
      message_count: 3,
      has_attachment: false,
      has_draft: false,
      read: false,
      received_at: "2026-10-12T10:05:00.000Z",
      folder: "inbox",
    };
    const list = { object: "list", has_more: false, data: [{ ...item, quarantined: 2 }, item] };
    const { ms } = makeClient({ body: list });
    const res = await ms.inboxes.threads.list(INBOX_ID, { includeQuarantined: true });
    expect(res.data).toEqual(list);
    expect(res.data?.data[0]?.quarantined).toBe(2);
    expect(res.data?.data[1]?.quarantined).toBeUndefined();
  });

  it("threads get, update and remove", async () => {
    const { ms, calls } = makeClient({ body: { object: "inbox_thread", id: THREAD_ID } });
    await ms.inboxes.threads.get(INBOX_ID, THREAD_ID);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `https://api.test/inboxes/${INBOX_ID}/threads/${THREAD_ID}`,
    });
    await ms.inboxes.threads.update(INBOX_ID, THREAD_ID, {
      read: true,
      folder: "archive",
      labelId: "l1",
    });
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      url: `https://api.test/inboxes/${INBOX_ID}/threads/${THREAD_ID}`,
    });
    expect(calls[1]?.body).toEqual({ read: true, folder: "archive", label_id: "l1" });
    await ms.inboxes.threads.remove(INBOX_ID, THREAD_ID);
    expect(calls[2]).toMatchObject({
      method: "DELETE",
      url: `https://api.test/inboxes/${INBOX_ID}/threads/${THREAD_ID}`,
    });
  });

  it("thread emails list, get, reply and forward", async () => {
    const base = `https://api.test/inboxes/${INBOX_ID}/threads/${THREAD_ID}/emails`;
    const { ms, calls } = makeClient({ body: SENT_EMAIL });
    await ms.inboxes.threads.emails.list(INBOX_ID, THREAD_ID, { after: EMAIL_ID });
    expect(calls[0]).toMatchObject({ method: "GET", url: `${base}?after=${EMAIL_ID}` });
    await ms.inboxes.threads.emails.get(INBOX_ID, THREAD_ID, EMAIL_ID);
    expect(calls[1]).toMatchObject({ method: "GET", url: `${base}/${EMAIL_ID}` });

    const replied = await ms.inboxes.threads.emails.reply(
      INBOX_ID,
      THREAD_ID,
      EMAIL_ID,
      { text: "Thanks, confirmed.", replyAll: true, requiresApproval: true },
      { idempotencyKey: "r-1" },
    );
    expect(calls[2]).toMatchObject({ method: "POST", url: `${base}/${EMAIL_ID}/reply` });
    expect(calls[2]?.body).toEqual({
      text: "Thanks, confirmed.",
      reply_all: true,
      requires_approval: true,
    });
    expect(calls[2]?.headers["Idempotency-Key"]).toBe("r-1");
    expect(replied.data).toEqual({ kind: "sent", email: SENT_EMAIL });

    await ms.inboxes.threads.emails.forward(
      INBOX_ID,
      THREAD_ID,
      EMAIL_ID,
      { to: "ops@acme.dev", subject: "Fwd: hi" },
      { idempotencyKey: "f-1" },
    );
    expect(calls[3]).toMatchObject({ method: "POST", url: `${base}/${EMAIL_ID}/forward` });
    expect(calls[3]?.body).toEqual({ to: "ops@acme.dev", subject: "Fwd: hi" });
    expect(calls[3]?.headers["Idempotency-Key"]).toBe("f-1");

    const { ms: held } = makeClient({ status: 202, body: DRAFT });
    const res = await held.inboxes.threads.emails.forward(INBOX_ID, THREAD_ID, EMAIL_ID, {
      to: "success@simulator.amazonses.com",
    });
    expect(res.data).toEqual({ kind: "draft", draft: DRAFT });
  });

  it("thread emails list and get take includeQuarantined", async () => {
    const base = `https://api.test/inboxes/${INBOX_ID}/threads/${THREAD_ID}/emails`;
    const { ms, calls } = makeClient({ body: SENT_EMAIL });
    await ms.inboxes.threads.emails.list(INBOX_ID, THREAD_ID, {
      limit: 2,
      includeQuarantined: true,
    });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `${base}?limit=2&include_quarantined=true`,
    });
    await ms.inboxes.threads.emails.get(INBOX_ID, THREAD_ID, EMAIL_ID, {
      includeQuarantined: true,
    });
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: `${base}/${EMAIL_ID}?include_quarantined=true`,
    });
  });

  it("drafts list, create, get, update, remove and reject", async () => {
    const base = `https://api.test/inboxes/${INBOX_ID}/drafts`;
    const { ms, calls } = makeClient({ status: 201, body: DRAFT });
    await ms.inboxes.drafts.list(INBOX_ID, { limit: 5 });
    expect(calls[0]).toMatchObject({ method: "GET", url: `${base}?limit=5` });

    const created = await ms.inboxes.drafts.create(INBOX_ID, {
      to: "success@simulator.amazonses.com",
      text: "Thanks, confirmed.",
      threadId: THREAD_ID,
      replyToEmailId: EMAIL_ID,
    });
    expect(calls[1]).toMatchObject({ method: "POST", url: base });
    expect(calls[1]?.body).toEqual({
      to: "success@simulator.amazonses.com",
      text: "Thanks, confirmed.",
      thread_id: THREAD_ID,
      reply_to_email_id: EMAIL_ID,
    });
    expect(created.data).toEqual(DRAFT);

    await ms.inboxes.drafts.get(INBOX_ID, DRAFT_ID);
    expect(calls[2]).toMatchObject({ method: "GET", url: `${base}/${DRAFT_ID}` });
    await ms.inboxes.drafts.update(INBOX_ID, DRAFT_ID, {
      cc: null,
      subject: null,
      html: "<p>x</p>",
    });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: `${base}/${DRAFT_ID}` });
    expect(calls[3]?.body).toEqual({ cc: null, subject: null, html: "<p>x</p>" });
    await ms.inboxes.drafts.remove(INBOX_ID, DRAFT_ID);
    expect(calls[4]).toMatchObject({ method: "DELETE", url: `${base}/${DRAFT_ID}` });
    await ms.inboxes.drafts.reject(INBOX_ID, DRAFT_ID);
    expect(calls[5]).toMatchObject({ method: "POST", url: `${base}/${DRAFT_ID}/reject` });
    expect(calls[5]?.body).toBeUndefined();
  });

  it("drafts.send posts no body with an Idempotency-Key; 200 sent, 202 held", async () => {
    const sent = { object: "inbox_draft", id: DRAFT_ID, thread_id: THREAD_ID, email_id: EMAIL_ID };
    const { ms, calls } = makeClient({ body: sent });
    const res = await ms.inboxes.drafts.send(INBOX_ID, DRAFT_ID, { idempotencyKey: "send-1" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `https://api.test/inboxes/${INBOX_ID}/drafts/${DRAFT_ID}/send`,
    });
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("send-1");
    expect(res.data).toEqual({ kind: "sent", email: sent });

    const { ms: held } = makeClient({ status: 202, body: DRAFT });
    expect((await held.inboxes.drafts.send(INBOX_ID, DRAFT_ID)).data).toEqual({
      kind: "draft",
      draft: DRAFT,
    });

    const agent = {
      statusCode: 403,
      name: "approval_required",
      message: "This draft waits for a person to approve it",
    };
    const { ms: refused } = makeClient({ status: 403, body: agent });
    expect(await refused.inboxes.drafts.send(INBOX_ID, DRAFT_ID)).toEqual({
      data: null,
      error: { ...agent, retryAfter: null },
    });
  });
});

describe("inbox fields on existing resources", () => {
  it("webhooks carry inbox_ids on create and update", async () => {
    const { ms, calls } = makeClient({ body: { object: "webhook", id: "w1" } });
    await ms.webhooks.create({
      endpoint: "https://acme.dev/hooks",
      events: ["email.received", "inbox.email.received"],
      inboxIds: [INBOX_ID],
    });
    expect(calls[0]?.body).toEqual({
      endpoint: "https://acme.dev/hooks",
      events: ["email.received", "inbox.email.received"],
      inbox_ids: [INBOX_ID],
    });
    await ms.webhooks.update("w1", { inboxIds: null });
    expect(calls[1]?.body).toEqual({ inbox_ids: null });
  });

  it("apiKeys.create restricts a key to an inbox", async () => {
    const { ms, calls } = makeClient({ body: { id: "k1", token: "ms_secret" } });
    await ms.apiKeys.create({ name: "agent", permission: "full_access", inboxId: INBOX_ID });
    expect(calls[0]?.body).toEqual({
      name: "agent",
      permission: "full_access",
      inbox_id: INBOX_ID,
    });
  });

  it("domains.update toggles catch-all", async () => {
    const { ms, calls } = makeClient({ body: { object: "domain", receiving_catch_all: false } });
    const res = await ms.domains.update({ id: "d1", receivingCatchAll: false });
    expect(calls[0]?.body).toEqual({ receiving_catch_all: false });
    expect(res.data?.receiving_catch_all).toBe(false);
  });
});

describe("domains: the shared row", () => {
  const OWN = {
    id: OWN_DOMAIN_ID,
    name: "acme.dev",
    status: "verified",
    created_at: "2026-10-14T09:00:00.000Z",
    region: "us-east-1",
    open_tracking: true,
    click_tracking: true,
    tracking_subdomain: "links",
    capabilities: { sending: "enabled", receiving: "enabled" },
    receiving_catch_all: false,
    shared: false,
  };
  const SHARED = {
    id: DOMAIN_ID,
    name: "acme.agents.example.com",
    status: "verified",
    created_at: "2026-10-12T10:00:00.000Z",
    region: "us-east-1",
    open_tracking: false,
    click_tracking: false,
    tracking_subdomain: null,
    capabilities: { sending: "enabled", receiving: "enabled" },
    receiving_catch_all: false,
    shared: true,
    sending_mode: "reply_only",
    sending_mode_reason: "plan",
  };

  it("list returns own domains, then the shared row", async () => {
    const list = { object: "list", has_more: false, data: [OWN, SHARED] };
    const { ms } = makeClient({ body: list });
    const res = await ms.domains.list();
    expect(res.data).toEqual(list);
    const [own, shared] = res.data?.data ?? [];
    expect(own?.shared).toBe(false);
    expect(own?.sending_mode).toBeUndefined();
    expect(own?.sending_mode_reason).toBeUndefined();
    expect(shared?.shared).toBe(true);
    expect(shared?.sending_mode).toBe("reply_only");
    expect(shared?.sending_mode_reason).toBe("plan");
  });

  it("a domain from a server before v0.14.0 has no shared key, read as false", async () => {
    const { shared: _, ...older } = OWN;
    const { ms } = makeClient({ body: older });
    const res = await ms.domains.get(OWN_DOMAIN_ID);
    expect(res.data).toEqual(older);
    expect(res.data?.shared ?? false).toBe(false);
  });

  it("get returns the shared row with no records; open mode has a null reason", async () => {
    const detail = {
      object: "domain",
      ...SHARED,
      sending_mode: "open",
      sending_mode_reason: null,
      records: [],
    };
    const { ms, calls } = makeClient({ body: detail });
    const res = await ms.domains.get(DOMAIN_ID);
    expect(calls[0]).toMatchObject({ method: "GET", url: `https://api.test/domains/${DOMAIN_ID}` });
    expect(res.data).toEqual(detail);
    expect(res.data?.records).toEqual([]);
    expect(res.data?.sending_mode_reason).toBeNull();
  });

  it("tolerates a sending_mode it does not know (open set)", async () => {
    const { ms } = makeClient({ body: { ...SHARED, sending_mode: "paused_for_review" } });
    const res = await ms.domains.get(DOMAIN_ID);
    expect(res.data?.sending_mode).toBe("paused_for_review");
    const future: DomainSendingMode = "paused_for_review";
    expect(future).toBe("paused_for_review");
  });

  it("changing the shared row is a 403 forbidden", async () => {
    const forbidden = {
      statusCode: 403,
      name: "forbidden",
      message:
        "acme.agents.example.com is your team's subdomain of the shared domain: it can't be changed or deleted",
    };
    const { ms } = makeClient({ status: 403, body: forbidden });
    expect(await ms.domains.update({ id: DOMAIN_ID, clickTracking: true })).toEqual({
      data: null,
      error: { ...forbidden, retryAfter: null },
    });
  });
});
