import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  AddContactSegmentResponse,
  BatchContactsResponse,
  BatchRemoveContactsOptions,
  Contact,
  ContactAddress,
  ContactId,
  ContactListItem,
  ContactPreferencesLink,
  ContactSegmentOptions,
  ContactTopic,
  CreateContactOptions,
  CreateContactsBatchOptions,
  List,
  ListContactTopicsOptions,
  ListContactsOptions,
  RemoveContactResponse,
  RemoveContactSegmentResponse,
  UpdateContactOptions,
  UpdateContactTopicsOptions,
  UpdateContactTopicsResponse,
} from "../types.js";

function normalize(address: string | ContactAddress): ContactAddress {
  return typeof address === "string" ? { id: address } : address;
}

/** Contact path: email wins over id. */
function contactPath(addr: ContactAddress): string {
  return `/contacts/${encodeURIComponent(addr.email ?? addr.id ?? "")}`;
}

function createBody(o: CreateContactOptions) {
  return {
    email: o.email,
    first_name: o.firstName,
    last_name: o.lastName,
    unsubscribed: o.unsubscribed,
    properties: o.properties,
    segments: o.segments,
    topics: o.topics,
  };
}

function updateBody(o: UpdateContactOptions) {
  return {
    first_name: o.firstName,
    last_name: o.lastName,
    unsubscribed: o.unsubscribed,
    properties: o.properties,
  };
}

/** Per-contact topic subscriptions (opt in/out of a topic). */
export class ContactTopics {
  constructor(private readonly http: HttpClient) {}

  update(options: UpdateContactTopicsOptions): Promise<Result<UpdateContactTopicsResponse>> {
    return this.http.request({
      method: "PATCH",
      path: `${contactPath(options)}/topics`,
      body: options.topics,
    });
  }

  /** GET /contacts/:id/topics — every team topic with the contact's effective subscription (unpaginated). */
  list(options: ListContactTopicsOptions): Promise<Result<List<ContactTopic>>> {
    return this.http.request({ method: "GET", path: `${contactPath(options)}/topics` });
  }
}

/** Contact ↔ segment membership. */
export class ContactSegments {
  constructor(private readonly http: HttpClient) {}

  private path(o: ContactSegmentOptions): string {
    const contact = encodeURIComponent(o.email ?? o.id ?? o.contactId ?? "");
    return `/contacts/${contact}/segments/${encodeURIComponent(o.segmentId)}`;
  }

  /** POST /contacts/:id/segments/:segmentId */
  add(options: ContactSegmentOptions): Promise<Result<AddContactSegmentResponse>> {
    return this.http.request({ method: "POST", path: this.path(options) });
  }

  /** DELETE /contacts/:id/segments/:segmentId */
  remove(options: ContactSegmentOptions): Promise<Result<RemoveContactSegmentResponse>> {
    return this.http.request({ method: "DELETE", path: this.path(options) });
  }
}

/** Bulk contact creation and deletion (MillionSend extension; Resend imports contacts via CSV only). */
export class ContactsBatch {
  constructor(private readonly http: HttpClient) {}

  /** POST /contacts/batch — 1–1000 contacts; `onConflict` and `batchValidation` shape the outcome. */
  create(
    payload: CreateContactOptions[],
    options: CreateContactsBatchOptions = {},
  ): Promise<Result<BatchContactsResponse>> {
    return this.http.request({
      method: "POST",
      path: "/contacts/batch",
      query: { on_conflict: options.onConflict },
      body: payload.map(createBody),
      headers: { "x-batch-validation": options.batchValidation },
    });
  }

  /** POST /contacts/batch/remove — by `ids` or by `emails` (1–1000); lists only the rows deleted. */
  remove(options: BatchRemoveContactsOptions): Promise<Result<{ data: RemoveContactResponse[] }>> {
    return this.http.request({
      method: "POST",
      path: "/contacts/batch/remove",
      body: { ids: options.ids, emails: options.emails },
    });
  }
}

export class Contacts {
  readonly topics: ContactTopics;
  readonly segments: ContactSegments;
  readonly batch: ContactsBatch;

  constructor(private readonly http: HttpClient) {
    this.topics = new ContactTopics(http);
    this.segments = new ContactSegments(http);
    this.batch = new ContactsBatch(http);
  }

  create(payload: CreateContactOptions): Promise<Result<ContactId>> {
    return this.http.request({ method: "POST", path: "/contacts", body: createBody(payload) });
  }

  get(address: string | ContactAddress): Promise<Result<Contact>> {
    return this.http.request({ method: "GET", path: contactPath(normalize(address)) });
  }

  update(options: UpdateContactOptions): Promise<Result<ContactId>> {
    return this.http.request({ method: "PATCH", path: contactPath(options), body: updateBody(options) });
  }

  remove(address: string | ContactAddress): Promise<Result<RemoveContactResponse>> {
    return this.http.request({ method: "DELETE", path: contactPath(normalize(address)) });
  }

  /** POST /contacts/:id/preferences-link — the contact's hosted preference page URL (422 when the instance cannot mint links). */
  preferencesLink(address: string | ContactAddress): Promise<Result<ContactPreferencesLink>> {
    return this.http.request({
      method: "POST",
      path: `${contactPath(normalize(address))}/preferences-link`,
    });
  }

  /** GET /contacts, or GET /segments/:segmentId/contacts when `segmentId` is given. */
  list(options?: ListContactsOptions): Promise<Result<List<ContactListItem>>> {
    const path = options?.segmentId
      ? `/segments/${encodeURIComponent(options.segmentId)}/contacts`
      : "/contacts";
    return this.http.request({ method: "GET", path, query: listQuery(options) });
  }
}
