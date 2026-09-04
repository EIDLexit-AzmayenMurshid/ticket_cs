const { HUBSPOT_API_BASE } = require('./constants');

// Centralized token resolution allows fallback names during migration.
function getHubSpotToken() {
  return (
    process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
    process.env.HUBSPOT_ACCESS_TOKEN ||
    process.env.PRIVATE_APP_TOKEN ||
    ''
  ).trim();
}

// Standardizes status handling so callers can map errors to user-friendly responses.
function classifyHubSpotFailure(error) {
  const status = error?.statusCode || error?.status || 500;
  if (status === 401) {
    return { statusCode: 401, message: 'HubSpot authentication failed (401).' };
  }
  if (status === 403) {
    return { statusCode: 403, message: 'HubSpot permission denied (403).' };
  }
  if (status === 429) {
    return { statusCode: 429, message: 'HubSpot rate limited request (429).' };
  }
  if (status >= 500) {
    return { statusCode: 502, message: 'HubSpot upstream error (5xx).' };
  }
  return { statusCode: 500, message: 'HubSpot request failed.' };
}

// Thin wrapper around fetch to enforce auth headers and throw structured errors.
async function hubspotRequest(token, path, options = {}) {
  const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  // HubSpot generally returns JSON, but empty responses are handled safely.
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(json?.message || `HubSpot API error (${response.status})`);
    error.statusCode = response.status;
    error.response = json;
    throw error;
  }

  return json;
}

module.exports = {
  getHubSpotToken,
  classifyHubSpotFailure,
  hubspotRequest,
};