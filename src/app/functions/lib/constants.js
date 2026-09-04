// Base URL for all HubSpot CRM API requests from app functions.
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// Property keys can be overridden via environment variables when portals use custom names.
const PROPERTY_KEYS = {
  externalTicketId: process.env.EXTERNAL_TICKET_ID_PROPERTY || 'external_ticket_id',
  sourceSystem: process.env.SOURCE_SYSTEM_PROPERTY || 'source_system',
  syncStatus: process.env.SYNC_STATUS_PROPERTY || 'external_sync_status',
  lastSyncAt: process.env.LAST_SYNC_AT_PROPERTY || 'external_last_sync_at',
  lastSyncResult: process.env.LAST_SYNC_RESULT_PROPERTY || 'external_last_sync_result',
  lastWebhookEventId:
    process.env.LAST_WEBHOOK_EVENT_ID_PROPERTY || 'external_last_webhook_event_id',
};

module.exports = {
  HUBSPOT_API_BASE,
  PROPERTY_KEYS,
};