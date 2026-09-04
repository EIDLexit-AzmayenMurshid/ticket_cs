# Project Secrets Documentation

This document describes all secrets required for the ticket integration project and their purposes.

## Required Secrets

### 1. `HUBSPOT_PRIVATE_APP_TOKEN`
**Type:** Private App Access Token  
**Purpose:** Authenticates all HubSpot API requests (ticket creation, updates, searches)  
**Format:** `pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`  
**Where to get it:**
- HubSpot Portal → **Settings** → **Integrations** → **Private apps**
- Select your private app → **Auth** tab
- Copy the "Private app access token"

**Scopes required:**
- `crm.objects.tickets.read` - Search for existing tickets by external ID
- `crm.objects.tickets.write` - Create and update tickets

**Used in:**
- `TicketIngestEndpoint.js` - Creates/updates tickets in HubSpot
- `TicketSyncStatusFunction.js` - Updates sync status properties
- `verify-rate-limit.js` - Integration tests

**⚠️ Security:** Never commit this token. Store only in HubSpot Secrets, `.env` (local dev), or Azure Function App Settings.

---

### 2. `RATE_LIMIT_MAX_TOKENS`
**Type:** Configuration (number)  
**Purpose:** Sets the maximum tokens available per user per time window  
**Default Value:** `30`  
**Format:** Integer (e.g., `30`, `60`, `100`)

**How it works:**
- Each user gets `RATE_LIMIT_MAX_TOKENS` requests per `RATE_LIMIT_WINDOW_SECONDS`
- Example: `30` tokens per `60` seconds = 30 requests per minute per user
- Requests beyond this limit return `HTTP 429` (Too Many Requests)

**Used in:**
- `lib/rate-limit.js` - Token bucket algorithm
- `TicketIngestEndpoint.js` - Rate limit enforcement on ticket ingest
- `verify-rate-limit.js` - Testing rate limit behavior

**⚠️ Note:** Not sensitive, but affects API availability. Adjust based on usage patterns.

---

### 3. `RATE_LIMIT_WINDOW_SECONDS`
**Type:** Configuration (number)  
**Purpose:** Defines the time window (in seconds) for token bucket refill  
**Default Value:** `60`  
**Format:** Integer representing seconds (e.g., `60`, `3600`, `86400`)

**How it works:**
- Token bucket resets every `RATE_LIMIT_WINDOW_SECONDS` seconds
- Example: `60` seconds = 1 minute window
- After the window expires, all tokens are refilled for the user

**Common values:**
- `60` = 1 minute window (per-minute rate limit)
- `3600` = 1 hour window (per-hour rate limit)
- `86400` = 1 day window (per-day rate limit)

**Used in:**
- `lib/rate-limit.js` - Token bucket window calculation
- `TicketIngestEndpoint.js` - Rate limit enforcement
- `verify-rate-limit.js` - Testing with configurable windows

**⚠️ Note:** Not sensitive. Affects API rate limit behavior.

---

### 4. `INTEGRATION_INGEST_TOKEN`
**Type:** Shared Secret (bearer token)  
**Purpose:** Protects the ticket ingest endpoint from unauthorized callers  
**Format:** Any secure random string (e.g., `Bearer abc123xyz...`)  
**Optional:** Can be omitted if endpoint authentication is not needed
**Test value:** my-ticket-ingest-token-12345 (CHANGE DURING PRODUCTION)

**How it works:**
- Callers must include header: `Authorization: Bearer <INTEGRATION_INGEST_TOKEN>`
- If header is missing or incorrect, the endpoint returns `HTTP 401` (Unauthorized)
- If not set in secrets, authorization check is skipped

**Example usage:**
```bash
curl -X POST https://your-endpoint.com/api/tickets \
  -H "Authorization: Bearer your-integration-token" \
  -H "Content-Type: application/json" \
  -d '{"subject": "New Ticket", "external_ticket_id": "ext-123"}'
```

**Used in:**
- `TicketIngestEndpoint.js` - Authorization validation before processing
- `lib/http-utils.js` - Header parsing

**⚠️ Security:** 
- Generate a strong random string (e.g., UUID or cryptographic token)
- Share only with authorized callers
- Never commit to version control
- Rotate periodically

---

## Summary Table

| Secret | Type | Required | Scope | Sensitivity |
|--------|------|----------|-------|-------------|
| `HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot Token | ✅ Yes | API Authentication | 🔴 High |
| `RATE_LIMIT_MAX_TOKENS` | Configuration | ✅ Yes | Rate Limit | 🟡 Low |
| `RATE_LIMIT_WINDOW_SECONDS` | Configuration | ✅ Yes | Rate Limit | 🟡 Low |
| `INTEGRATION_INGEST_TOKEN` | Bearer Token | ❌ Optional | Endpoint Auth | 🟠 Medium |

---

## How to Set Secrets in HubSpot

1. Go to **HubSpot Portal** → **Developer** → **Functions**
2. Select your app/function
3. Navigate to **Settings** → **Secrets**
4. Click **Add Secret**
5. Enter the secret name and value
6. Click **Save**

Once saved, all functions in your app can access them via `process.env.SECRET_NAME`.

---

## Local Development Setup

Create `local.settings.json` (not committed to git):

```json
{
  "IsEncrypted": false,
  "Values": {
    "HUBSPOT_PRIVATE_APP_TOKEN": "pat-na1-your-token-here",
    "RATE_LIMIT_MAX_TOKENS": "30",
    "RATE_LIMIT_WINDOW_SECONDS": "60",
    "INTEGRATION_INGEST_TOKEN": "your-local-test-token"
  }
}
```

---

## Environment-Specific Configuration

**Development (local):**
- Use `local.settings.json`
- Use test HubSpot account credentials

**Production (Azure Functions):**
- Set all secrets via Azure Portal → Function App → **Configuration** → **Application Settings**
- Use production HubSpot private app token
- Use strong, randomly generated tokens

---

## Security Best Practices

1. ✅ Store all secrets in HubSpot Secrets or secure vaults
2. ✅ Never hardcode tokens in source files
3. ✅ Add `.env` and `local.settings.json` to `.gitignore`
4. ✅ Use different tokens for development vs. production
5. ✅ Rotate tokens regularly
6. ✅ Audit secret access and usage
7. ✅ Use environment-specific configurations
8. ✅ Document secret purposes (as in this file)

---

## Troubleshooting

**"401 Unauthorized" errors:**
- Verify `HUBSPOT_PRIVATE_APP_TOKEN` is set and valid
- Check token hasn't expired
- Ensure token has `crm.objects.tickets.read` and `crm.objects.tickets.write` scopes

**"429 Too Many Requests" errors:**
- Increase `RATE_LIMIT_MAX_TOKENS` or `RATE_LIMIT_WINDOW_SECONDS`
- Wait until `retryAfterSeconds` has passed before retrying
- Check if multiple callers are hitting the same endpoint

**"401 Unauthorized" on endpoint calls:**
- Verify `INTEGRATION_INGEST_TOKEN` is set in HubSpot Secrets
- Verify caller is sending correct `Authorization: Bearer <token>` header
- Check token matches exactly (case-sensitive, no extra spaces)
