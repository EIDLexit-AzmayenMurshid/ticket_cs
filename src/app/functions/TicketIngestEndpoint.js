const { PROPERTY_KEYS } = require('./lib/constants');
const {
  getHubSpotToken,
  classifyHubSpotFailure,
  hubspotRequest,
} = require('./lib/hubspot-client');
const { consumeRateLimitToken, getRateLimitConfig } = require('./lib/rate-limit');
const { send, getHeader, parsePayload, resolveRateLimitKey } = require('./lib/http-utils');

// Normalizes payload shape across snake_case/camelCase external integrations.
function normalizePayload(payload) {
  return {
    externalTicketId: payload.external_ticket_id || payload.externalTicketId || null,
    sourceSystem: payload.source_system || payload.sourceSystem || 'external-system',
    subject: payload.subject || payload.title || null,
    content: payload.content || payload.description || null,
    priority: payload.priority || null,
    pipeline: payload.pipeline || null,
    stage: payload.stage || payload.ticket_stage || null,
    ownerId: payload.owner || payload.ownerId || payload.hubspot_owner_id || null,
    eventId: payload.event_id || payload.eventId || null,
    eventType: payload.event_type || payload.eventType || 'ticket.ingest',
    eventTimestamp:
      payload.event_timestamp || payload.eventTimestamp || new Date().toISOString(),
    explicitHubSpotTicketId:
      payload.hubspot_ticket_id || payload.hubspotTicketId || payload.ticketId || null,
  };
}

// Maps external integration fields into standard HubSpot ticket properties.
function mapToTicketProperties(normalized) {
  const properties = {};
  if (normalized.subject) {
    properties.subject = normalized.subject;
  }
  if (normalized.content) {
    properties.content = normalized.content;
  }
  if (normalized.priority) {
    properties.hs_ticket_priority = normalized.priority;
  }
  if (normalized.pipeline) {
    properties.hs_pipeline = normalized.pipeline;
  }
  if (normalized.stage) {
    properties.hs_pipeline_stage = normalized.stage;
  }
  if (normalized.ownerId) {
    properties.hubspot_owner_id = String(normalized.ownerId);
  }
  return properties;
}

// Writes integration-specific sync metadata back to the HubSpot ticket.
function mapStatusProperties(normalized, statusValue) {
  const statusProps = {};
  statusProps[PROPERTY_KEYS.syncStatus] = statusValue;
  statusProps[PROPERTY_KEYS.lastSyncAt] = new Date().toISOString();
  statusProps[PROPERTY_KEYS.lastSyncResult] = `${statusValue}:${normalized.eventType}`;

  if (normalized.externalTicketId) {
    statusProps[PROPERTY_KEYS.externalTicketId] = String(normalized.externalTicketId);
  }
  if (normalized.sourceSystem) {
    statusProps[PROPERTY_KEYS.sourceSystem] = String(normalized.sourceSystem);
  }
  if (normalized.eventId) {
    statusProps[PROPERTY_KEYS.lastWebhookEventId] = String(normalized.eventId);
  }

  return statusProps;
}

// Dedupe lookup for idempotency. Repeated external ids update existing tickets.
async function findExistingTicketByExternalId(token, externalTicketId) {
  if (!externalTicketId) {
    return { ticketId: null, mappingMissing: false };
  }

  try {
    const result = await hubspotRequest(token, '/crm/v3/objects/tickets/search', {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: PROPERTY_KEYS.externalTicketId,
                operator: 'EQ',
                value: String(externalTicketId),
              },
            ],
          },
        ],
        limit: 1,
      },
    });

    const existing = result?.results?.[0];
    return { ticketId: existing?.id || null, mappingMissing: false };
  } catch (error) {
    if (error.statusCode === 400) {
      return { ticketId: null, mappingMissing: true };
    }
    throw error;
  }
}

exports.main = async (context = {}, sendResponse) => {
  // API token used for HubSpot CRUD/search operations.
  const token = getHubSpotToken();
  if (!token) {
    send(sendResponse, 500, {
      success: false,
      error:
        'Missing HubSpot token. Set HUBSPOT_PRIVATE_APP_TOKEN (or HUBSPOT_ACCESS_TOKEN/PRIVATE_APP_TOKEN).',
    });
    return;
  }

  // Shared-secret check for endpoint caller authentication.
  const expectedIngestToken = (process.env.INTEGRATION_INGEST_TOKEN || '').trim();
  if (expectedIngestToken) {
    const authHeader = getHeader(context?.event, 'authorization') || '';
    const expectedHeader = `Bearer ${expectedIngestToken}`;
    if (authHeader !== expectedHeader) {
      send(sendResponse, 401, {
        success: false,
        error: 'Invalid ingest authorization token.',
      });
      return;
    }
  }

  const payload = parsePayload(context);
  const rateLimitKey = resolveRateLimitKey(context, payload);
  const rateLimitConfig = getRateLimitConfig();
  const rateLimitResult = consumeRateLimitToken(rateLimitKey, rateLimitConfig);

  if (!rateLimitResult.allowed) {
    send(sendResponse, 429, {
      success: false,
      error: 'Rate limit exceeded. Token bucket empty for the current window.',
      rateLimit: {
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        resetAt: rateLimitResult.resetAt,
      },
    });
    return;
  }

  const normalized = normalizePayload(payload);

  if (!normalized.subject && !normalized.externalTicketId && !normalized.explicitHubSpotTicketId) {
    send(sendResponse, 400, {
      success: false,
      error:
        'Invalid payload. Provide at least one of: subject, external_ticket_id, hubspot_ticket_id.',
    });
    return;
  }

  try {
    const dedupeLookup = await findExistingTicketByExternalId(token, normalized.externalTicketId);
    const ticketProperties = mapToTicketProperties(normalized);

    const ticketIdToUpdate =
      normalized.explicitHubSpotTicketId || dedupeLookup.ticketId || null;

    let ticketId = ticketIdToUpdate;
    let operation = 'updated';

    // Update existing ticket if found/provided; otherwise create a new ticket.
    if (ticketIdToUpdate) {
      await hubspotRequest(token, `/crm/v3/objects/tickets/${ticketIdToUpdate}`, {
        method: 'PATCH',
        body: { properties: ticketProperties },
      });
    } else {
      const created = await hubspotRequest(token, '/crm/v3/objects/tickets', {
        method: 'POST',
        body: { properties: ticketProperties },
      });
      ticketId = created?.id;
      operation = 'created';
    }

    const statusProperties = mapStatusProperties(normalized, 'synced');
    let mappingWarning = dedupeLookup.mappingMissing;

    // Sync-status writes can fail if custom properties are not yet created.
    try {
      await hubspotRequest(token, `/crm/v3/objects/tickets/${ticketId}`, {
        method: 'PATCH',
        body: { properties: statusProperties },
      });
    } catch (error) {
      if (error.statusCode === 400) {
        mappingWarning = true;
      } else {
        throw error;
      }
    }

    send(sendResponse, 200, {
      success: true,
      operation,
      ticketId,
      dedupedByExternalTicketId: Boolean(dedupeLookup.ticketId),
      externalTicketId: normalized.externalTicketId,
      sourceSystem: normalized.sourceSystem,
      webhookEventId: normalized.eventId,
      webhookEventTimestamp: normalized.eventTimestamp,
      rateLimit: {
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
      },
      mappingWarning,
      status: mappingWarning ? 'synced_with_missing_mappings' : 'synced',
    });
  } catch (error) {
    const classified = classifyHubSpotFailure(error);
    send(sendResponse, classified.statusCode, {
      success: false,
      error: classified.message,
      details: error?.response || error?.message || 'unknown error',
    });
  }
};