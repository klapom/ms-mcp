import { http, type HttpHandler, HttpResponse } from "msw";
import type { PathParams } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Mock user data
const mockUser = {
  id: "user-123",
  displayName: "Test User",
  mail: "test.user@example.com",
  userPrincipalName: "test.user@example.com",
  jobTitle: "Software Engineer",
  department: "Engineering",
  officeLocation: "Building 1",
  companyName: "Contoso Ltd",
  mobilePhone: "+1 555-0100",
  businessPhones: ["+1 555-0200"],
  givenName: "Test",
  surname: "User",
  city: "Seattle",
  state: "WA",
  country: "USA",
  streetAddress: "123 Main St",
  postalCode: "98101",
  preferredLanguage: "en-US",
  employeeId: "EMP123",
  accountEnabled: true,
};

const mockManager = {
  id: "manager-456",
  displayName: "Manager User",
  mail: "manager@example.com",
  userPrincipalName: "manager@example.com",
  jobTitle: "Engineering Manager",
  department: "Engineering",
  officeLocation: "Building 1",
  mobilePhone: "+1 555-0300",
  businessPhones: ["+1 555-0400"],
};

const mockDirectReports = [
  {
    id: "report-1",
    displayName: "Report One",
    mail: "report1@example.com",
    userPrincipalName: "report1@example.com",
    jobTitle: "Junior Engineer",
    department: "Engineering",
    officeLocation: "Building 2",
    mobilePhone: "+1 555-0500",
    businessPhones: [],
  },
  {
    id: "report-2",
    displayName: "Report Two",
    mail: "report2@example.com",
    userPrincipalName: "report2@example.com",
    jobTitle: "Junior Engineer",
    department: "Engineering",
    officeLocation: "Building 2",
    mobilePhone: "+1 555-0600",
    businessPhones: [],
  },
];

const mockGroups = [
  {
    id: "group-1",
    displayName: "Engineering Team",
    description: "All engineering staff",
    mail: "engineering@example.com",
    mailEnabled: true,
    securityEnabled: true,
  },
  {
    id: "group-2",
    displayName: "All Employees",
    description: "All company employees",
    mail: null,
    mailEnabled: false,
    securityEnabled: true,
  },
];

const mockUsers = [
  mockUser,
  mockManager,
  ...mockDirectReports,
  {
    id: "user-789",
    displayName: "Another User",
    mail: "another@example.com",
    userPrincipalName: "another@example.com",
    jobTitle: "Product Manager",
    department: "Product",
    officeLocation: "Building 3",
    mobilePhone: null,
    businessPhones: [],
  },
];

// Mock photo data (1x1 JPEG)
const mockPhoto = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA/9k=",
  "base64",
);

export const userHandlers: HttpHandler[] = [
  // GET /me (current user profile)
  http.get<PathParams>(`${GRAPH_BASE}/me`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.has("$select")) {
      return HttpResponse.json(mockUser);
    }
    return HttpResponse.json(mockUser);
  }),

  // GET /users (search users)
  http.get<PathParams>(`${GRAPH_BASE}/users`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("$search");
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);

    if (search) {
      // Search mode
      const results = mockUsers.filter((u) => {
        const searchLower = search.toLowerCase();
        return (
          u.displayName.toLowerCase().includes(searchLower) ||
          u.mail?.toLowerCase().includes(searchLower) ||
          u.userPrincipalName.toLowerCase().includes(searchLower)
        );
      });

      const paged = results.slice(skip, skip + top);
      return HttpResponse.json({
        value: paged,
        "@odata.count": results.length,
      });
    }

    // List mode (not used in our tools, but good for testing)
    const paged = mockUsers.slice(skip, skip + top);
    return HttpResponse.json({
      value: paged,
      "@odata.count": mockUsers.length,
    });
  }),

  // GET /users/{id} (specific user)
  http.get<PathParams>(`${GRAPH_BASE}/users/:userId`, ({ params }) => {
    const { userId } = params;

    if (userId === "not-found") {
      return HttpResponse.json(
        {
          error: {
            code: "Request_ResourceNotFound",
            message: "Resource not found",
          },
        },
        { status: 404 },
      );
    }

    const user = mockUsers.find((u) => u.id === userId || u.userPrincipalName === userId);
    if (user) {
      return HttpResponse.json(user);
    }

    // Default to mockUser for unknown IDs
    return HttpResponse.json(mockUser);
  }),

  // GET /me/manager or /users/{id}/manager
  http.get<PathParams>(new RegExp(`${GRAPH_BASE}/(me|users/[^/]+)/manager`), ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.includes("no-manager")) {
      return HttpResponse.json(
        {
          error: {
            code: "Request_ResourceNotFound",
            message: "Manager not found",
          },
        },
        { status: 404 },
      );
    }

    return HttpResponse.json(mockManager);
  }),

  // GET /me/directReports or /users/{id}/directReports
  http.get<PathParams>(
    new RegExp(`${GRAPH_BASE}/(me|users/[^/]+)/directReports`),
    ({ request }) => {
      const url = new URL(request.url);
      const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
      const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);

      const paged = mockDirectReports.slice(skip, skip + top);
      return HttpResponse.json({
        value: paged,
        "@odata.count": mockDirectReports.length,
      });
    },
  ),

  // GET /me/memberOf or /users/{id}/memberOf
  http.get<PathParams>(new RegExp(`${GRAPH_BASE}/(me|users/[^/]+)/memberOf`), ({ request }) => {
    const url = new URL(request.url);
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);

    const paged = mockGroups.slice(skip, skip + top);
    return HttpResponse.json({
      value: paged,
      "@odata.count": mockGroups.length,
    });
  }),

  // GET /users/{id}/photo/$value or /users/{id}/photo/{size}/$value
  http.get<PathParams>(
    new RegExp(`${GRAPH_BASE}/users/[^/]+/photo(/[^/]+)?/\\$value`),
    ({ params, request }) => {
      const url = new URL(request.url);

      if (url.pathname.includes("no-photo")) {
        return HttpResponse.json(
          {
            error: {
              code: "ImageNotFound",
              message: "User photo not found",
            },
          },
          { status: 404 },
        );
      }

      // Return mock photo as arraybuffer
      return new HttpResponse(mockPhoto, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
        },
      });
    },
  ),
];
