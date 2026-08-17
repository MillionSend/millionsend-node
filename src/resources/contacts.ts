import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  Contact,
  ContactAddress,
  ContactId,
  ContactListItem,
  CreateContactOptions,
  List,
  ListOptions,
  RemoveContactResponse,
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
    const key = encodeURIComponent(options.email ?? options.id ?? "");
    return this.http.request({
      method: "PATCH",
      path: `/contacts/${key}/topics`,
      body: options.topics,
    });
  }
}

export class Contacts {
  readonly topics: ContactTopics;

  constructor(private readonly http: HttpClient) {
    this.topics = new ContactTopics(http);
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

  list(options?: ListOptions): Promise<Result<List<ContactListItem>>> {
    return this.http.request({ method: "GET", path: "/contacts", query: listQuery(options) });
  }
}
