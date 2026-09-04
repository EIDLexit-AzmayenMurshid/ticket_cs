# TODO - ticket_cs HubSpot Ticket Integration

Last updated: 2026-09-02
Project root: C:/EIDLexit/tpcs/ticket_cs
Target account: test-env (51928895)

## Current Status Snapshot
- Ticket card is live-data capable and no longer mock-based.
- Ingestion endpoint and private sync-status function are implemented.
- Idempotency is implemented using external_ticket_id dedupe (update existing ticket on repeated external ID).
- Card UI includes error state, webhook delay warning, and missing mapping warning.
- Lint and project validation are passing.
- Current blocker: function deploy fails because required HubSpot secrets do not exist in account yet.

## Completed Work (Do Not Rebuild)
1. Card entrypoint and scope
  - card scope: tickets only
  - location: crm.record.tab
  - entrypoint: /app/cards/TicketIntegrationCard.tsx
2. Integration backend
  - endpoint function uid: ticket_cs_ingest_endpoint
  - endpoint path: /integration/tickets/ingest
  - private function uid: ticket_cs_sync_status_function
3. Data flow implemented
  - ingest payload normalization
  - create/update ticket flow
  - dedupe by external_ticket_id
  - sync status field writes
  - card fetches sync status via private function
4. Code organization
  - card modules split into focused files
  - shared backend helpers added in src/app/functions/lib

## Blocking Issue (Must Fix First)
Missing required HubSpot secrets in target account:
1. INTEGRATION_INGEST_TOKEN
2. HUBSPOT_PRIVATE_APP_TOKEN

Without these, function components cannot deploy.

## Exact Next Steps
1. Open terminal in C:/EIDLexit/tpcs/ticket_cs
2. Add secrets:
  - hs secret add INTEGRATION_INGEST_TOKEN "<value>"
  - hs secret add HUBSPOT_PRIVATE_APP_TOKEN "<value>"
3. Verify secrets:
  - hs secret list
4. Re-upload/deploy project:
  - hs project upload
5. Confirm deployment outcome:
  - both function components deploy successfully
6. Start local runtime:
  - hs project dev
7. Validate card in HubSpot UI:
  - open a Ticket record
  - verify card loads sync status
  - verify Refresh status button works
8. Validate endpoint behavior:
  - POST test payload to /integration/tickets/ingest with Authorization: Bearer <INTEGRATION_INGEST_TOKEN>
  - confirm first request creates or updates ticket
  - repeat same external_ticket_id and confirm no duplicate ticket is created
  - confirm card shows updated sync status, last sync time, and webhook event id
9. Validate external source compatibility:
  - confirm Integral IT's proprietary ticketing software can send HTTPS requests to /integration/tickets/ingest
  - confirm it can supply a supported auth header and payload shape
  - confirm the same dedupe and rate-limit behavior works for that source

## Test Payload Template
Use this JSON body for ingest tests:

{
  "external_ticket_id": "ext-1001",
  "source_system": "external-system",
  "subject": "Integration test ticket",
  "description": "Testing ingest endpoint",
  "priority": "HIGH",
  "pipeline": "0",
  "stage": "1",
  "event_id": "evt-1001",
  "event_type": "ticket.updated",
  "event_timestamp": "2026-09-02T22:00:00.000Z"
}

## Key Files (Authoritative)
- src/app/cards/card-hsmeta.json
- src/app/cards/TicketIntegrationCard.tsx
- src/app/cards/integration/useTicketSyncStatus.ts
- src/app/functions/endpoint-function-hsmeta.json
- src/app/functions/private-function-hsmeta.json
- src/app/functions/TicketIngestEndpoint.js
- src/app/functions/TicketSyncStatusFunction.js
- src/app/functions/lib/constants.js

## Validation Commands
- hs project validate
- hs project lint
- hs project upload
- hs project dev

## Troubleshooting
1. Port 4828 in use:
  - Get-NetTCPConnection -LocalPort 4828 -State Listen
  - Stop-Process -Id <PID> -Force
2. Wrong directory:
  - Set-Location C:/EIDLexit/tpcs/ticket_cs
3. Secret error during upload:
  - hs secret list
  - hs secret add <MISSING_SECRET_NAME> "<value>"
  - hs project upload

## Far Future Versions (Post-Launch Hardening)
These are intentionally deferred until current deployment/runtime goals are complete.

### Version F1 - Durable Ingest Queue
1. Add a durable queue between ingest endpoint and HubSpot write operations.
2. Change endpoint behavior to accept and enqueue quickly, then return 202 Accepted.
3. Include an ingest event id in response for traceability.

### Version F2 - Retry + Backoff + Dead Letter Queue
1. Add worker retry policy with exponential backoff for transient failures.
2. Add max-attempt handling and move poison events to a dead letter queue.
3. Add replay tooling/process for dead letter queue events.

### Version F3 - Delivery Guarantees + Observability
1. Add end-to-end delivery status tracking (received, queued, processing, succeeded, failed).
2. Add alerts for queue depth, retry storms, and dead letter queue growth.
3. Add SLO/SLA metrics and dashboards for ingest success and processing latency.

### Version F4 - Multi-Instance Global Rate Limiting
1. Move rate-limit bucket state to shared storage so limits are global across instances.
2. Keep per-user token-bucket policy at 30 tokens/60 seconds unless monitoring data supports adjustment.
3. Add per-source overrides for trusted internal systems if needed.

## Handoff Prompt For Next AI Session
Use this exact prompt:

"Continue work on C:/EIDLexit/tpcs/ticket_cs. Assume live integration implementation is already done (card, endpoint function, private sync function, idempotent dedupe by external_ticket_id, and modular refactor). Do not rebuild completed features. First unblock deployment by ensuring HubSpot secrets INTEGRATION_INGEST_TOKEN and HUBSPOT_PRIVATE_APP_TOKEN exist, then run hs project upload and verify both functions deploy. Next run hs project dev and validate card behavior on a real ticket. After that, make a concrete integration plan for Integral IT's proprietary ticketing software so it can push tickets into /integration/tickets/ingest and display them in HubSpot. Include the exact connection pattern, auth approach, payload mapping, any middleware or polling needed if Integral cannot call HubSpot directly, and the validation steps for dedupe and rate limiting. Keep scope tickets-only and avoid unrelated refactors."

Secondary prompt:

"Continue work on C:/EIDLexit/tpcs/ticket_cs. Keep the current HubSpot ticket integration intact and do not rebuild completed features. Focus specifically on making the system compatible with Integral IT's proprietary ticketing software. Define the exact push or polling pattern, the auth mechanism, the JSON payload contract, any middleware or bridge needed if Integral cannot call HubSpot directly, and the validation steps needed to prove tickets flow from Integral into HubSpot and display correctly on the ticket card. Also document any assumptions, constraints, or required changes to secrets, endpoints, or rate limiting. Keep scope tickets-only and avoid unrelated refactors."
