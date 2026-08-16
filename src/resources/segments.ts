import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateSegmentOptions,
  List,
  ListOptions,
  RemoveSegmentResponse,
  Segment,
  UpdateSegmentOptions,
} from "../types.js";

/**
 * Dynamic segments — a saved filter over an audience's contacts (MillionSend
 * extension, no Resend equivalent). `get` returns a live `contact_count`.
 */
export class Segments {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateSegmentOptions): Promise<Result<Segment>> {
    return this.http.request({
      method: "POST",
      path: "/segments2",
      body: { name: payload.name, audience_id: payload.audienceId, filter: payload.filter },
    });
  }

  get(id: string): Promise<Result<Segment>> {
    return this.http.request({ method: "GET", path: `/segments2/${encodeURIComponent(id)}` });
  }

  list(options?: ListOptions): Promise<Result<List<Segment>>> {
    return this.http.request({ method: "GET", path: "/segments2", query: listQuery(options) });
  }

  update(id: string, payload: UpdateSegmentOptions): Promise<Result<Segment>> {
    return this.http.request({
      method: "PATCH",
      path: `/segments2/${encodeURIComponent(id)}`,
      body: { name: payload.name, filter: payload.filter },
    });
  }

  remove(id: string): Promise<Result<RemoveSegmentResponse>> {
    return this.http.request({ method: "DELETE", path: `/segments2/${encodeURIComponent(id)}` });
  }
}
