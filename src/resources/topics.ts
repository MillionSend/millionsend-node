import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import type { CreateTopicOptions, RemoveTopicResponse, Topic, TopicId } from "../types.js";

/** Subscription topics — granular unsubscribe categories for a team. */
export class Topics {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateTopicOptions): Promise<Result<TopicId>> {
    return this.http.request({
      method: "POST",
      path: "/topics",
      body: {
        name: payload.name,
        description: payload.description,
        default_subscription: payload.defaultSubscription,
      },
    });
  }

  get(id: string): Promise<Result<Topic>> {
    return this.http.request({ method: "GET", path: `/topics/${encodeURIComponent(id)}` });
  }

  /** GET /topics — a bare `{ data }` list (topics are unpaginated). */
  list(): Promise<Result<{ data: Topic[] }>> {
    return this.http.request({ method: "GET", path: "/topics" });
  }

  remove(id: string): Promise<Result<RemoveTopicResponse>> {
    return this.http.request({ method: "DELETE", path: `/topics/${encodeURIComponent(id)}` });
  }
}
