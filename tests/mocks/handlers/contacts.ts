import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const sampleContact = {
  id: "contact-001",
  displayName: "Alice Mueller",
  givenName: "Alice",
  surname: "Mueller",
  emailAddresses: [{ name: "Alice Mueller", address: "alice@example.com" }],
  businessPhones: ["+49 123 456789"],
  homePhones: ["+49 987 654321"],
  mobilePhone: "+49 170 1234567",
  companyName: "Contoso GmbH",
  jobTitle: "Software Engineer",
  department: "Engineering",
  officeLocation: "Building A",
  businessAddress: {
    street: "Main St 1",
    city: "Berlin",
    state: "Berlin",
    postalCode: "10115",
    countryOrRegion: "Germany",
  },
  homeAddress: null,
  birthday: "1990-06-15",
  personalNotes: "Met at conference",
  categories: ["VIP"],
};

const sampleContact2 = {
  id: "contact-002",
  displayName: "Bob Smith",
  givenName: "Bob",
  surname: "Smith",
  emailAddresses: [{ name: "Bob Smith", address: "bob@example.com" }],
  businessPhones: [],
  companyName: "Fabrikam Inc",
  jobTitle: "Manager",
};

const sampleFolder = {
  id: "folder-001",
  displayName: "Business Contacts",
  parentFolderId: "root",
};

export const contactHandlers = [
  // GET /me/contacts — list
  http.get(`${GRAPH_BASE}/me/contacts`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 3) return;

    const search = url.searchParams.get("$search");
    if (search) {
      return HttpResponse.json({
        "@odata.count": 1,
        value: [sampleContact],
      });
    }

    return HttpResponse.json({
      value: [sampleContact, sampleContact2],
    });
  }),

  // GET /me/contacts/:id — get single
  http.get(`${GRAPH_BASE}/me/contacts/:contactId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    if (params.contactId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Contact not found." } },
        { status: 404 },
      );
    }

    return HttpResponse.json({ ...sampleContact, id: params.contactId });
  }),

  // GET /me/contactFolders/:folderId/contacts — list from folder
  http.get(`${GRAPH_BASE}/me/contactFolders/:folderId/contacts`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return HttpResponse.json({ value: [sampleContact] });
  }),

  // GET /me/contactFolders — list folders
  http.get(`${GRAPH_BASE}/me/contactFolders`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 3) return;

    return HttpResponse.json({ value: [sampleFolder] });
  }),

  // GET /users/:uid/contacts — multi-tenant list
  http.get(`${GRAPH_BASE}/users/:uid/contacts`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    return HttpResponse.json({ value: [sampleContact] });
  }),

  // GET /users/:uid/contacts/:id — multi-tenant get
  http.get(`${GRAPH_BASE}/users/:uid/contacts/:contactId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return HttpResponse.json({ ...sampleContact, id: params.contactId });
  }),

  // POST /me/contacts — create
  http.post(`${GRAPH_BASE}/me/contacts`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 3) return;

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ...sampleContact,
        id: "contact-new-001",
        displayName: body.displayName ?? sampleContact.displayName,
        givenName: body.givenName ?? sampleContact.givenName,
      },
      { status: 201 },
    );
  }),

  // PATCH /me/contacts/:id — update
  http.patch(`${GRAPH_BASE}/me/contacts/:contactId`, async ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    if (params.contactId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Contact not found." } },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...sampleContact, id: params.contactId, ...body });
  }),

  // DELETE /me/contacts/:id — delete
  http.delete(`${GRAPH_BASE}/me/contacts/:contactId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    if (params.contactId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Contact not found." } },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
