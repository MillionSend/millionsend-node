import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateWebhookOptions,
  CreateWebhookResponse,
  List,
  ListOptions,
  RemoveWebhookResponse,
  UpdateWebhookOptions,
  Webhook,
  WebhookId,
  WebhookListItem,
} from "../types.js";

/** Event webhooks. `create` and `get` return the signing secret. */
export class Webhooks {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateWebhookOptions): Promise<Result<CreateWebhookResponse>> {
    return this.http.request({
      method: "POST",
      path: "/webhooks",
      body: {
        endpoint: payload.endpoint,
        events: payload.events,
        signing_secret: payload.signingSecret,
      },
    });
  }

  list(options?: ListOptions): Promise<Result<List<WebhookListItem>>> {
    return this.http.request({ method: "GET", path: "/webhooks", query: listQuery(options) });
  }

  get(id: string): Promise<Result<Webhook>> {
    return this.http.request({ method: "GET", path: `/webhooks/${encodeURIComponent(id)}` });
  }

  update(id: string, payload: UpdateWebhookOptions): Promise<Result<WebhookId>> {
    return this.http.request({
      method: "PATCH",
      path: `/webhooks/${encodeURIComponent(id)}`,
      body: { endpoint: payload.endpoint, events: payload.events, status: payload.status },
    });
  }

  remove(id: string): Promise<Result<RemoveWebhookResponse>> {
    return this.http.request({ method: "DELETE", path: `/webhooks/${encodeURIComponent(id)}` });
  }
}
