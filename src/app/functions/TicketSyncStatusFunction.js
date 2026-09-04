const { Client } = require('@hubspot/api-client');

// Property keys for custom integration properties
const PROPERTY_KEYS = {
  externalTicketId: process.env.EXTERNAL_TICKET_ID_PROPERTY || 'external_ticket_id',
  sourceSystem: process.env.SOURCE_SYSTEM_PROPERTY || 'source_system',
  syncStatus: process.env.SYNC_STATUS_PROPERTY || 'external_sync_status',
  lastSyncAt: process.env.LAST_SYNC_AT_PROPERTY || 'external_last_sync_at',
  lastSyncResult: process.env.LAST_SYNC_RESULT_PROPERTY || 'external_last_sync_result',
  lastWebhookEventId:
    process.env.LAST_WEBHOOK_EVENT_ID_PROPERTY || 'external_last_webhook_event_id',
};

exports.main = async (context = {}) => {
  try {
    // Get ticketId from context
    const ticketId = context?.ticketId;
    if (!ticketId) {
      return {
        success: false,
        error: 'Missing ticketId parameter.',
      };
    }

    // Create HubSpot client using the app's authentication context
    // (no token needed—runs in the app's auth context automatically)
    const hubspotClient = new Client();
    
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

    // Fetch ticket with all properties
    const ticket = await hubspotClient.crm.tickets.basicApi.getById(
      ticketId,
      propertiesToFetch
    );

    const properties = ticket?.properties || {};

    return {
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
    };
  } catch (error) {
    console.error('Ticket sync status error:', error?.message);
    return {
      success: false,
      error: error?.message || 'Failed to fetch ticket sync status',
    };
  }
};