

# Webhooks & Change Notifications

This document describes how to set up real-time change notifications from Microsoft Graph API using webhooks and subscriptions.

**Status:** Documentation only — webhook endpoint infrastructure is not implemented in this MCP server. This guide provides patterns and examples for implementing webhooks in external services.

---

## Overview

Microsoft Graph supports change notifications via webhook subscriptions. When a subscribed resource changes, Graph sends an HTTP POST notification to your webhook endpoint.

**Key Features:**
- Real-time notifications for created, updated, deleted resources
- Support for Mail, Calendar, OneDrive, Teams, Contacts, To Do
- Subscription lifetime: up to 3 days (must renew before expiration)
- Validation handshake on subscription creation
- Client state secret for authenticating notifications

**Limitations:**
- Requires publicly accessible HTTPS endpoint
- Not suitable for CLI tools or desktop apps (MCP server runs locally)
- Subscription persistence required (lost on server restart)

---

## Supported Resources

| Resource | Notification Types | Scope Required |
|---|---|---|
| `/me/mailFolders/{id}/messages` | created, updated, deleted | Mail.Read |
| `/me/messages` | created, updated, deleted | Mail.Read |
| `/me/calendar/events` | created, updated, deleted | Calendars.Read |
| `/me/drive/root` | created, updated, deleted | Files.Read |
| `/me/contacts` | created, updated, deleted | Contacts.Read |
| `/me/todo/lists/{id}/tasks` | created, updated, deleted | Tasks.Read |
| `/me/chats/{id}/messages` | created, updated, deleted | Chat.Read |
| `/teams/{id}/channels/{id}/messages` | created, updated, deleted | ChannelMessage.Read.All |

Full list: [Microsoft Graph webhooks documentation](https://learn.microsoft.com/en-us/graph/webhooks)

---

## Setup Steps

### 1. Create Webhook Endpoint

Your webhook endpoint must:
- Be publicly accessible via HTTPS (HTTP not supported)
- Respond to validation requests (GET with `validationToken`)
- Process notifications (POST with notification payload)
- Respond within 3 seconds (Graph timeout)

**Example using Express.js:**

```typescript
import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const CLIENT_STATE = crypto.randomBytes(16).toString("hex");

app.post("/webhook", (req, res) => {
  // Validation request (initial handshake)
  if (req.query.validationToken) {
    res.type("text/plain").send(req.query.validationToken);
    return;
  }

  // Verify client state
  const clientState = req.headers["x-ms-graph-clientstate"];
  if (clientState !== CLIENT_STATE) {
    res.status(401).send("Unauthorized");
    return;
  }

  // Process notifications
  const notifications = req.body.value;
  for (const notification of notifications) {
    console.log("Notification:", {
      changeType: notification.changeType,
      resource: notification.resource,
      resourceData: notification.resourceData,
    });
  }

  // Must respond quickly (< 3 seconds)
  res.status(202).send("Accepted");
});

app.listen(443, () => {
  console.log("Webhook endpoint listening on port 443");
});
```

### 2. Expose Endpoint Publicly

**For local development:**

Use [ngrok](https://ngrok.com/) to create a public HTTPS tunnel:

```bash
# Install ngrok
npm install -g ngrok

# Create tunnel (requires free account)
ngrok http 3000

# Output:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

Your webhook URL: `https://abc123.ngrok.io/webhook`

**For production:**

Deploy your webhook endpoint to a cloud provider:
- AWS Lambda + API Gateway
- Azure Functions
- Google Cloud Functions
- Heroku, Render, Fly.io, etc.

Ensure HTTPS is enabled (required by Graph API).

---

## Creating Subscriptions

### via Graph API (curl)

```bash
curl -X POST https://graph.microsoft.com/v1.0/subscriptions \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "changeType": "created,updated,deleted",
    "notificationUrl": "https://yourdomain.com/webhook",
    "resource": "/me/mailFolders('Inbox')/messages",
    "expirationDateTime": "2026-02-20T00:00:00Z",
    "clientState": "my-secret-state"
  }'
```

**Response:**

```json
{
  "id": "subscription-id-here",
  "resource": "/me/mailFolders('Inbox')/messages",
  "changeType": "created,updated,deleted",
  "clientState": "my-secret-state",
  "notificationUrl": "https://yourdomain.com/webhook",
  "expirationDateTime": "2026-02-20T00:00:00Z",
  "creatorId": "user-id-here"
}
```

### via Graph SDK (TypeScript)

```typescript
import { Client } from "@microsoft/microsoft-graph-client";

const client = Client.initWithMiddleware({ /* ... */ });

const subscription = await client.api("/subscriptions").post({
  changeType: "created,updated,deleted",
  notificationUrl: "https://yourdomain.com/webhook",
  resource: "/me/mailFolders('Inbox')/messages",
  expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
  clientState: "my-secret-state",
});

console.log("Subscription created:", subscription.id);
```

---

## Validation Flow

When creating a subscription, Graph sends a **validation request** to your webhook endpoint:

**1. Graph sends GET request:**

```
GET https://yourdomain.com/webhook?validationToken=abc123xyz
```

**2. Your endpoint must respond:**

```
HTTP/1.1 200 OK
Content-Type: text/plain

abc123xyz
```

If your endpoint doesn't respond correctly within 10 seconds, the subscription creation fails.

---

## Notification Payload

When a resource changes, Graph sends a POST request to your webhook endpoint.

**Example notification (inbox message created):**

```json
{
  "value": [
    {
      "subscriptionId": "subscription-id-here",
      "clientState": "my-secret-state",
      "changeType": "created",
      "resource": "Users/user-id/Messages/message-id",
      "subscriptionExpirationDateTime": "2026-02-20T00:00:00Z",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Message",
        "@odata.id": "Users/user-id/Messages/message-id",
        "@odata.etag": "etag-value",
        "id": "message-id"
      },
      "tenantId": "tenant-id-here"
    }
  ]
}
```

**Fields:**

- `subscriptionId` — ID of the subscription that triggered this notification
- `clientState` — Your secret value (use to verify sender is Graph)
- `changeType` — `created`, `updated`, or `deleted`
- `resource` — Graph API path to the changed resource
- `resourceData` — Minimal resource info (ID, type, etag)

**Important:** The notification contains only **metadata**, not the full resource. To get the full message/event/file, make a separate Graph API call using the `resource` path.

---

## Renewing Subscriptions

Subscriptions expire after **3 days** (maximum allowed by Graph). You must renew them before expiration.

**Renewal via Graph API:**

```bash
curl -X PATCH https://graph.microsoft.com/v1.0/subscriptions/{subscription-id} \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "expirationDateTime": "2026-02-23T00:00:00Z"
  }'
```

**Renewal strategy:**

1. Store subscription IDs and expiration times in a database
2. Set up a cron job to renew subscriptions daily
3. Check for subscriptions expiring within 24 hours
4. Extend expiration by 3 days

**Example renewal logic (pseudocode):**

```typescript
async function renewSubscriptions() {
  const subs = await db.getSubscriptionsExpiringWithin(24 * 60 * 60 * 1000);

  for (const sub of subs) {
    const newExpiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await graphClient.api(`/subscriptions/${sub.id}`).patch({
      expirationDateTime: newExpiration.toISOString(),
    });

    await db.updateSubscriptionExpiration(sub.id, newExpiration);
  }
}

// Run daily
setInterval(renewSubscriptions, 24 * 60 * 60 * 1000);
```

---

## Deleting Subscriptions

When you no longer need notifications, delete the subscription:

```bash
curl -X DELETE https://graph.microsoft.com/v1.0/subscriptions/{subscription-id} \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

**Response:** `204 No Content`

---

## Security Best Practices

### 1. Verify Client State

Always check the `X-MS-Graph-ClientState` header matches your secret:

```typescript
const clientState = req.headers["x-ms-graph-clientstate"];
if (clientState !== MY_CLIENT_STATE) {
  res.status(401).send("Unauthorized");
  return;
}
```

### 2. Use HTTPS Only

Graph API requires HTTPS. Never expose webhook endpoints over HTTP.

### 3. Validate Subscription ID

Check that the `subscriptionId` in the notification matches one you created:

```typescript
const sub = await db.getSubscription(notification.subscriptionId);
if (!sub) {
  // Unknown subscription — ignore or log
  return;
}
```

### 4. Rate Limiting

Graph may send bursts of notifications. Implement rate limiting or queuing:

```typescript
import Queue from "bull";

const notificationQueue = new Queue("notifications");

app.post("/webhook", (req, res) => {
  // Quickly queue notifications and respond
  for (const notification of req.body.value) {
    notificationQueue.add(notification);
  }
  res.status(202).send("Accepted");
});

// Process in background
notificationQueue.process(async (job) => {
  await handleNotification(job.data);
});
```

### 5. Idempotency

Notifications may be delivered more than once. Use resource IDs or etags to detect duplicates:

```typescript
const notificationId = `${notification.subscriptionId}:${notification.resourceData.id}:${notification.resourceData["@odata.etag"]}`;

if (await cache.has(notificationId)) {
  // Already processed
  return;
}

await cache.set(notificationId, true, 24 * 60 * 60 * 1000); // 24h TTL
await handleNotification(notification);
```

---

## Fetching Full Resource Data

Notifications contain **only metadata**. To get the full resource, make a Graph API call.

**Example (new message notification):**

```typescript
async function handleNotification(notification) {
  if (notification.changeType === "created") {
    // notification.resource = "Users/user-id/Messages/message-id"
    const message = await graphClient.api(`/${notification.resource}`).get();

    console.log("New message:", {
      subject: message.subject,
      from: message.from.emailAddress.address,
      receivedDateTime: message.receivedDateTime,
    });
  }
}
```

**Optimization:** Use `$select` to retrieve only needed fields:

```typescript
const message = await graphClient
  .api(`/${notification.resource}`)
  .select(["subject", "from", "receivedDateTime"])
  .get();
```

---

## Limitations & Gotchas

1. **Public Endpoint Required:** Webhooks don't work for localhost or private networks (use ngrok for dev).
2. **3-Second Response Time:** Your endpoint must respond within 3 seconds or Graph will retry.
3. **3-Day Expiration:** Subscriptions auto-expire after 3 days — must implement renewal logic.
4. **No Persistence:** If your server restarts, subscriptions are lost (unless stored in DB).
5. **Notification Delays:** Notifications typically arrive within seconds, but can take up to 3 minutes.
6. **Maximum Subscriptions:** 500 subscriptions per user per app.
7. **Rich Notifications:** Not all resources support rich notifications (full resource data). Most require a separate GET request.
8. **Encryption:** Microsoft supports encrypted notifications, but requires certificate setup (advanced).

---

## Integration with MCP Server

The MS-MCP server is a **CLI tool** that runs locally on the user's machine. It cannot receive webhook notifications directly because:

- No public HTTPS endpoint (runs on localhost)
- Subprocess of Claude Code/Desktop (no server infrastructure)
- Token-based auth (user-specific, not app-specific)

**Recommended Architecture:**

If you need real-time notifications in your Claude workflow:

1. **Deploy a separate webhook receiver** (Express server on cloud platform)
2. **Store notifications in a database** (PostgreSQL, MongoDB, etc.)
3. **Create MCP tools to query notifications** (`list_notifications`, `get_notification`)
4. **Claude polls the database** periodically or on user request

**Example workflow:**

```
User: "Show me any new emails in the last 5 minutes"

Claude:
1. Calls `list_notifications` MCP tool
2. Tool queries notification database
3. Filters for changeType=created, resource=messages
4. Calls `read_email` for each new message ID
5. Presents summary to user
```

---

## Example: Complete Webhook Setup

### 1. Deploy Webhook Endpoint

```typescript
// webhook-server.ts
import express from "express";
import crypto from "node:crypto";
import { Client } from "@microsoft/microsoft-graph-client";

const app = express();
app.use(express.json());

const CLIENT_STATE = process.env.WEBHOOK_CLIENT_STATE || crypto.randomBytes(16).toString("hex");

// In-memory storage (use database in production)
const notifications: unknown[] = [];

app.post("/webhook", (req, res) => {
  // Validation handshake
  if (req.query.validationToken) {
    console.log("Validation request received");
    res.type("text/plain").send(req.query.validationToken);
    return;
  }

  // Verify client state
  const clientState = req.headers["x-ms-graph-clientstate"];
  if (clientState !== CLIENT_STATE) {
    console.warn("Invalid client state");
    res.status(401).send("Unauthorized");
    return;
  }

  // Store notifications
  const incomingNotifications = req.body.value || [];
  notifications.push(...incomingNotifications);

  console.log(`Received ${incomingNotifications.length} notifications`);

  // Respond quickly
  res.status(202).send("Accepted");
});

app.get("/notifications", (req, res) => {
  res.json({ notifications });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Client state: ${CLIENT_STATE}`);
});
```

### 2. Create Subscription

```bash
# Get access token
TOKEN=$(pnpm auth token)  # Hypothetical CLI command

# Create subscription
curl -X POST https://graph.microsoft.com/v1.0/subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "changeType": "created",
    "notificationUrl": "https://your-webhook.com/webhook",
    "resource": "/me/mailFolders('\''Inbox'\'')/messages",
    "expirationDateTime": "'$(date -u -d '+3 days' +%Y-%m-%dT%H:%M:%SZ)'",
    "clientState": "your-client-state-here"
  }'
```

### 3. Test with Real Email

Send yourself an email. Within seconds, you should see:

```bash
curl https://your-webhook.com/notifications
```

Output:

```json
{
  "notifications": [
    {
      "subscriptionId": "...",
      "changeType": "created",
      "resource": "Users/user-id/Messages/message-id",
      "resourceData": {
        "id": "message-id"
      }
    }
  ]
}
```

---

## Further Reading

- [Microsoft Graph webhooks documentation](https://learn.microsoft.com/en-us/graph/webhooks)
- [Subscription resource type](https://learn.microsoft.com/en-us/graph/api/resources/subscription)
- [Change notifications delivery](https://learn.microsoft.com/en-us/graph/webhooks-lifecycle)
- [Encrypted notifications (advanced)](https://learn.microsoft.com/en-us/graph/webhooks-with-resource-data)
