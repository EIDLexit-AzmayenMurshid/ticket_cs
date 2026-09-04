const { PROPERTY_KEYS } = require('./lib/constants');
const {
  getHubSpotToken,
  classifyHubSpotFailure,
  hubspotRequest,
} = require('./lib/hubspot-client');
const { send, resolveTicketId } = require('./lib/http-utils');

exports.main = async (context = {}, sendResponse) => {
  // Shared HubSpot API token for reading ticket and integration fields.
  const token = getHubSpotToken();
  if (!token) {
    send(sendResponse, 500, {
      success: false,
      error:
        'Missing HubSpot token. Set HUBSPOT_PRIVATE_APP_TOKEN (or HUBSPOT_ACCESS_TOKEN/PRIVATE_APP_TOKEN).',
    });
    return;
  }

  // Ticket id can come from explicit parameters or HubSpot context payload.
  const ticketId = resolveTicketId(context);
  if (!ticketId) {
    send(sendResponse, 400, {
      success: false,
      error: 'Missing ticketId parameter for sync status lookup.',
    });
    return;
  }

  // Includes both native ticket fields and custom integration status fields.
  const propertiesToFetch = [
    'subject',
    'content',
    'hs_ticket_priority',
    'hs_pipeline',
    'hs_pipeline_stage',
    'hubspot_owner_id',
    PROPERTY_KEYS.externalTicketId,
    PROPERTY_KEYS.sourceSystem,
    PROPERTY_KEYS.syncStatus,
    PROPERTY_KEYS.lastSyncAt,
    PROPERTY_KEYS.lastSyncResult,
    PROPERTY_KEYS.lastWebhookEventId,
  ];

  try {
    // Build query with repeated properties parameters expected by HubSpot CRM API.
    const query = new URLSearchParams();
    propertiesToFetch.forEach((propertyName) => query.append('properties', propertyName));

    const ticket = await hubspotRequest(
      token,
      `/crm/v3/objects/tickets/${ticketId}?${query.toString()}`,
    );

    const properties = ticket?.properties || {};
    // Undefined properties usually mean missing custom mapping configuration.
    const missingMappings = Object.values(PROPERTY_KEYS).filter(
      (key) => properties[key] === undefined,
    );

    send(sendResponse, 200, {
      success: true,
      ticketId,
      syncStatus: properties[PROPERTY_KEYS.syncStatus] || 'not_synced',
      lastSyncAt: properties[PROPERTY_KEYS.lastSyncAt] || null,
      lastSyncResult: properties[PROPERTY_KEYS.lastSyncResult] || null,
      lastWebhookEventId: properties[PROPERTY_KEYS.lastWebhookEventId] || null,
      sourceSystem: properties[PROPERTY_KEYS.sourceSystem] || null,
      externalTicketId: properties[PROPERTY_KEYS.externalTicketId] || null,
      subject: properties.subject || null,
      priority: properties.hs_ticket_priority || null,
      pipeline: properties.hs_pipeline || null,
      stage: properties.hs_pipeline_stage || null,
      ownerId: properties.hubspot_owner_id || null,
      missingMappings,
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