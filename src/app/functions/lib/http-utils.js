// HubSpot function response helper with consistent status/body shape.
function send(sendResponse, statusCode, body) {
  sendResponse({
    statusCode,
    body,
  });
}

// Case-insensitive header lookup because inbound header casing is not guaranteed.
function getHeader(event, name) {
  const headers = event?.headers || {};
  const found = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  return found ? headers[found] : undefined;
}

function firstHeaderValue(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .split(',')
    .map((part) => part.trim())
    .find(Boolean) || null;
}

// Supports payload delivery via body, event payload, or direct parameters.
function parsePayload(context) {
  const candidate = context?.body ?? context?.event?.payload ?? context?.parameters;
  if (!candidate) {
    return {};
  }

  if (typeof candidate === 'string') {
    try {
      return JSON.parse(candidate);
    } catch {
      return {};
    }
  }

  return candidate;
}

function resolveRateLimitKey(context, payload = {}) {
  const event = context?.event;
  const preferredHeaders = [
    'x-rate-limit-user',
    'x-user-id',
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'authorization',
  ];

  for (const headerName of preferredHeaders) {
    const headerValue = firstHeaderValue(getHeader(event, headerName));
    if (headerValue) {
      return `${headerName}:${headerValue}`;
    }
  }

  if (payload.external_ticket_id || payload.externalTicketId) {
    return `external-ticket:${payload.external_ticket_id || payload.externalTicketId}`;
  }

  if (payload.source_system || payload.sourceSystem) {
    return `source-system:${payload.source_system || payload.sourceSystem}`;
  }

  return 'anonymous';
}

// Resolve ticket id from explicit params first, then from HubSpot context fallbacks.
function resolveTicketId(context) {
  const fromParams = context?.parameters?.ticketId || context?.parameters?.ticket_id;
  if (fromParams) {
    return String(fromParams);
  }

  const fromContextProperties =
    context?.propertiesToSend?.hs_object_id || context?.propertiesToSend?.objectId;
  if (fromContextProperties) {
    return String(fromContextProperties);
  }

  const fromObjectInfo = context?.object?.objectId || context?.objectId;
  return fromObjectInfo ? String(fromObjectInfo) : null;
}

module.exports = {
  send,
  getHeader,
  parsePayload,
  resolveRateLimitKey,
  resolveTicketId,
};