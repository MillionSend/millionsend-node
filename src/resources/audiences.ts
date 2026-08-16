import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  Audience,
  AudienceListItem,
  CreateAudienceOptions,
  List,
  ListOptions,
  RemoveAudienceResponse,
} from "../types.js";

/**
 * Audiences — named contact lists. Resend-compatible: a migrating app's
 * `audiences.*` calls map straight over. (MillionSend's dynamic-filter
 * `segments` are a separate, richer resource — see `client.segments`.)
 */
export class Audiences {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateAudienceOptions): Promise<Result<Audience>> {
    return this.http.request({ method: "POST", path: "/audiences", body: { name: payload.name } });
  }

  get(id: string): Promise<Result<Audience>> {
    return this.http.request({ method: "GET", path: `/audiences/${encodeURIComponent(id)}` });
  }

  list(options?: ListOptions): Promise<Result<List<AudienceListItem>>> {
    return this.http.request({ method: "GET", path: "/audiences", query: listQuery(options) });
  }

  remove(id: string): Promise<Result<RemoveAudienceResponse>> {
    return this.http.request({ method: "DELETE", path: `/audiences/${encodeURIComponent(id)}` });
  }
}
