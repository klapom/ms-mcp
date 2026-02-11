---
name: graph-api-patterns
description: Best Practices für Microsoft Graph API Zugriffe im MCP-Server
---
# Graph API Patterns

## Pagination
Immer `@odata.nextLink` verfolgen. Default-Pattern:

```typescript
async function* paginate<T>(client: Client, url: string): AsyncGenerator<T> {
  let nextUrl: string | undefined = url;
  while (nextUrl) {
    const response = await client.api(nextUrl).get();
    yield* response.value;
    nextUrl = response['@odata.nextLink'];
  }
}
```

## OData Filter
- Strings: `$filter=subject eq 'Test'`
- Dates: `$filter=receivedDateTime ge 2024-01-01T00:00:00Z`
- Contains: `$filter=contains(subject, 'test')`
- Kombiniert: `$filter=isRead eq false and importance eq 'high'`

## Default $select pro Entität (Context-Budget)
- Mail: `id,subject,from,receivedDateTime,bodyPreview,isRead,importance`
- Event: `id,subject,start,end,location,organizer,isAllDay`
- File: `id,name,size,lastModifiedDateTime,webUrl,file,folder`
- Contact: `id,displayName,emailAddresses,businessPhones,companyName`
- Task: `id,title,status,dueDateTime,importance`

## Error Handling
Graph-API HTTP-Codes auf MCP-Errors mappen:
- 400 → InvalidParams: "Ungültige Parameter: {details}"
- 401/403 → AuthError: "Fehlende Berechtigung: {scope}"
- 404 → NotFound: "Ressource nicht gefunden"
- 409 → ConflictError: "Ressource wurde zwischenzeitlich geändert"
- 429 → Retry mit `Retry-After` Header (automatisch)
- 500+ → ServiceError: "Graph API temporär nicht verfügbar"

## Rate Limiting
- Default: 10.000 Requests / 10 Min pro App
- Mail senden: 10.000 / Tag
- Immer `Retry-After` Header beachten
- Exponential Backoff: 1s, 2s, 4s, max 32s

## Batch Requests
- POST /$batch mit max 20 Requests pro Batch
- Jeder Request hat eigene ID
- Responses kommen in gleicher Reihenfolge
- Partial Failures getrennt behandeln

## File Transfer
- Download < 4MB: Direct GET mit Base64-Encoding
- Download > 4MB: Download-URL zurückgeben
- Upload < 4MB: PUT mit Content direkt
- Upload > 4MB: Resumable Upload Session

## Observability
- Jeder Graph-Call: pino.info mit tool, method, endpoint, status, duration_ms
- Fehler: pino.error mit error_code, required_scope
- NIEMALS loggen: Body-Inhalte, Token-Werte, PII
- Immer setzen: client-request-id Header für Korrelation
