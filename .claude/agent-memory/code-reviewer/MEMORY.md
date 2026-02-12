# Code Reviewer Memory - MS-MCP

## Common Issues Found

### Schema & Type Safety
- ReadEmailParams.max_body_length cap is 50000 but Config.limits.maxBodyLength default is 500 - potential mismatch
- mail-search.ts imports SearchEmailsParamsType but uses z.infer directly in code - inconsistent pattern
- DateTime parameters (ISO 8601) should use Zod .datetime() or regex validation to catch format errors early
- Temporal constraints (end >= start) should use .refine() for better error messages
- **Sprint 3.2**: calendar-write.ts DateTimeTimeZone.dateTime uses .string() not .datetime() (inconsistent with calendar.ts)

### Error Handling & Safety
- mail-folders.ts L93: Silent catch block logs warning but continues - could mask critical errors
- No validation that mail body conversions (HTML→Text) preserve security (XSS from malicious HTML)
- **Sprint 3.2**: Inconsistent checkConfirmation usage - calendar-create.ts wraps it in buildCreatePreview(), calendar-respond.ts calls it directly

### Testing Patterns
- Tests instantiate Client directly without mocking full middleware chain (auth missing)
- MSW handlers use path matching that can conflict (/me/mailFolders exact vs param paths)
- encodeURIComponent is NOT idempotent - tests should verify double-encoding behavior
- Unicode handling in IDs/paths needs explicit test coverage
- MSW handlers: Manual pathParts.length checks fragile but consistent pattern (see calendar.ts L172+)
- **Sprint 3.2**: calendar-availability.test.ts L106 - Test assertion mismatch (expects 2 schedules, sends 1)

### Cross-Cutting Concerns
- ✅ Context-Budget: All tools use $select with DEFAULT_SELECT entries
- ✅ Pagination: Handled via fetchPage utility
- ✅ URL Encoding: encodeGraphId() consistently applied to all dynamic IDs (Sprint 3.1)
- ⚠️ Error-Mapping: Not tested in all tool integration tests
- ⚠️ HTML→Text conversion: html-to-text library could be security risk if email contains malicious HTML

### MCP Tool Pattern Compliance
- ✅ All tools follow registration pattern via factory functions
- ✅ All use Zod schema .shape property for server.tool()
- ✅ All catch McpToolError and use formatErrorForUser()
- ✅ German error messages in user-facing text
- ✅ Sprint 3.2: 5 new calendar write tools (create, update, delete, respond, availability) - all patterns correct

## Recurring Patterns to Watch

1. **Type Guard Usage**: isRecordObject consistently used for unknown response parsing
2. **Factory Pattern**: Each tool module exports registerXxxTools(server, client, config)
3. **Response Shaping**: All list tools use shapeListResponse with bodyFields parameter
4. **Multi-tenant**: resolveUserPath(user_id) used for delegation support
5. **Logging**: Structured logging with tool name, no PII
6. **URL Encoding**: encodeGraphId() wrapper used for ALL dynamic IDs in Graph API URLs (not for static endpoints)
7. **MSW Handler Comments**: Handler-array comments MUST list all handler groups with routing specificity explanation
8. **Destructive Tool Helpers**: buildAttendeesBody (calendar-create), buildPatchBody (calendar-update) - could be DRY-extracted to toAttendees() util (like toRecipients)

## Architecture Decisions

- html-to-text conversion configured with wordwrap:120, skip images, link handling
- Mail folder expansion (include_children) fetches 1 level deep only
- Search combines $search + optional $filter (KQL + OData)
- Search does NOT support $orderby (Graph API limitation, logged as warning)
- Search does NOT support $skip (Graph API limitation, user gets hint to use nextLink)
- encodeGraphId() is a semantic wrapper around encodeURIComponent for Graph API IDs
- DEFAULT_SELECT.eventDetail includes `body` field - only used for single-item fetches (get_event), NOT lists
- Calendar DEFAULT_SELECT: event (list view) vs eventDetail (single item detail view)
- Calendar write operations: Create/Update/Delete/Respond all use destructive safety pattern (confirm + idempotency_key)
- respond_to_event validates isOrganizer (403 if true) to prevent invalid Graph API calls
- check_availability is BaseParams (safe), not WriteParams (no confirm needed)
