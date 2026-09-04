import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListItem,
  Heading,
  LoadingSpinner,
  StatusTag,
  Text,
} from '@hubspot/ui-extensions';
import { getSyncStatusVariant, hasWebhookDelay } from './statusUtils.js';
import type { SyncState } from './types.js';

// Stateless presenter for integration status UI.
type Props = SyncState & {
  ticketId: string;
  onRefresh: () => void;
};

export function SyncStatusPanel({
  ticketId,
  isLoading,
  isRefreshing,
  error,
  data,
  onRefresh,
}: Props) {
  const missingMappings = data?.missingMappings || [];
  const syncStatusLabel = data?.syncStatus || 'not_synced';

  return (
    <>
      {/* Initial loading state while sync status is fetched. */}
      {isLoading ? <LoadingSpinner label="Loading integration status" /> : null}

      {/* API/runtime failure from private sync-status function. */}
      {error ? (
        <Alert
          title="Integration API failure"
          variant="danger"
        >
          <Text>{error}</Text>
        </Alert>
      ) : null}

      {/* Main status panel shown when live data is available. */}
      {!isLoading && !error && data ? (
        <>
          <Heading>Sync Result</Heading>
          <StatusTag variant={getSyncStatusVariant(syncStatusLabel)}>{syncStatusLabel}</StatusTag>
          <DescriptionList>
            <DescriptionListItem label="HubSpot Ticket ID">
              <Text>{data.ticketId || ticketId || 'unknown'}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="External Ticket ID">
              <Text>{data.externalTicketId || 'missing'}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Source System">
              <Text>{data.sourceSystem || 'missing'}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Last Sync At">
              <Text>{data.lastSyncAt || 'never'}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Last Sync Result">
              <Text>{data.lastSyncResult || 'missing'}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Last Webhook Event ID">
              <Text>{data.lastWebhookEventId || 'missing'}</Text>
            </DescriptionListItem>
          </DescriptionList>

          {hasWebhookDelay(data.lastSyncAt) ? (
            <Alert
              title="Webhook delay detected"
              variant="warning"
            >
              <Text>
                Last sync is older than 15 minutes. Confirm source retries and webhook
                delivery health.
              </Text>
            </Alert>
          ) : null}

          {/* Warn when custom status properties are missing from the ticket object. */}
          {missingMappings.length > 0 ? (
            <Alert
              title="Missing mapping properties"
              variant="warning"
            >
              <Text>
                The integration status properties are not available on this ticket:
                {` ${missingMappings.join(', ')}`}
              </Text>
            </Alert>
          ) : null}

          {/* Manual refresh triggers a new private-function fetch. */}
          <Button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh status'}
          </Button>
        </>
      ) : null}
    </>
  );
}
