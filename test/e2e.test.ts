import { afterAll, describe, expect, it } from "vitest";
import { MillionSend } from "../src/index.js";

/**
 * End-to-end smoke test against a real MillionSend instance. Opt-in: set
 * MILLIONSEND_API_KEY (a full-access key) and, if not localhost:3001,
 * MILLIONSEND_BASE_URL. It exercises the audience + contact lifecycle, which
 * needs no verified domain. Sending is not asserted here because it requires a
 * verified sender domain; point `from` at one and uncomment locally to check.
 *
 *   MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 \
 *     pnpm exec vitest run e2e
 */
const apiKey = process.env.MILLIONSEND_API_KEY;
const run = apiKey ? describe : describe.skip;

// describe.skip still executes this callback at collection time, so the client
// must not be constructed unless the key is present — a throwing constructor
// here would fail the whole suite instead of skipping it. The null stand-in is
// safe: without a key the suite is skipped and no test body ever touches it.
run("e2e: audiences + contacts lifecycle", () => {
  const ms = apiKey ? new MillionSend(apiKey) : (null as unknown as MillionSend);
  const createdAudiences: string[] = [];

  afterAll(async () => {
    for (const id of createdAudiences) await ms.audiences.remove(id);
  });

  it("creates, reads, updates and deletes a contact in an audience", async () => {
    const audience = await ms.audiences.create({ name: `sdk-e2e-${Date.now()}` });
    expect(audience.error).toBeNull();
    const audienceId = audience.data?.id;
    expect(audienceId).toBeTruthy();
    if (!audienceId) return;
    createdAudiences.push(audienceId);

    const email = `sdk-e2e-${Date.now()}@example.com`;
    const created = await ms.contacts.create({ audienceId, email, firstName: "Ada" });
    expect(created.error).toBeNull();

    const fetched = await ms.contacts.get({ audienceId, email });
    expect(fetched.data?.email).toBe(email);
    expect(fetched.data?.first_name).toBe("Ada");

    const updated = await ms.contacts.update({ audienceId, email, unsubscribed: true });
    expect(updated.error).toBeNull();

    const removed = await ms.contacts.remove({ audienceId, email });
    expect(removed.data?.deleted).toBe(true);
  });

  it("surfaces a not_found error without throwing", async () => {
    const res = await ms.contacts.get({ email: "does-not-exist@example.com" });
    expect(res.data).toBeNull();
    expect(res.error?.name).toBe("not_found");
  });
});
