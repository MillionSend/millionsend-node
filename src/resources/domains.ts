import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateDomainOptions,
  CreateDomainResponse,
  Domain,
  DomainListItem,
  List,
  ListOptions,
  RemoveDomainResponse,
  UpdateDomainOptions,
} from "../types.js";

/**
 * Sending domains and their DNS records. The team's subdomain of the shared
 * inbox domain is listed too, read-only, as the last row (`shared: true`).
 */
export class Domains {
  constructor(private readonly http: HttpClient) {}

  /** POST /domains — returns the DNS records to publish. */
  create(payload: CreateDomainOptions): Promise<Result<CreateDomainResponse>> {
    return this.http.request({
      method: "POST",
      path: "/domains",
      body: {
        name: payload.name,
        region: payload.region,
        custom_return_path: payload.customReturnPath,
        open_tracking: payload.openTracking,
        click_tracking: payload.clickTracking,
        tracking_subdomain: payload.trackingSubdomain,
      },
    });
  }

  /** GET /domains — own domains newest first, then the shared row. */
  list(options?: ListOptions): Promise<Result<List<DomainListItem>>> {
    return this.http.request({ method: "GET", path: "/domains", query: listQuery(options) });
  }

  get(id: string): Promise<Result<Domain>> {
    return this.http.request({ method: "GET", path: `/domains/${encodeURIComponent(id)}` });
  }

  /**
   * PATCH /domains/:id — tracking and catch-all settings; `trackingSubdomain: null` clears it.
   * The shared row answers 403 `forbidden` here, on `verify` and on `remove`.
   */
  update(payload: UpdateDomainOptions): Promise<Result<Domain>> {
    return this.http.request({
      method: "PATCH",
      path: `/domains/${encodeURIComponent(payload.id)}`,
      body: {
        open_tracking: payload.openTracking,
        click_tracking: payload.clickTracking,
        tracking_subdomain: payload.trackingSubdomain,
        tls: payload.tls,
        capabilities: payload.capabilities,
        receiving_catch_all: payload.receivingCatchAll,
      },
    });
  }

  /** POST /domains/:id/verify — re-checks DNS and returns the domain. */
  verify(id: string): Promise<Result<Domain>> {
    return this.http.request({
      method: "POST",
      path: `/domains/${encodeURIComponent(id)}/verify`,
    });
  }

  remove(id: string): Promise<Result<RemoveDomainResponse>> {
    return this.http.request({ method: "DELETE", path: `/domains/${encodeURIComponent(id)}` });
  }
}
