import {
  Box,
  Divider,
  Heading,
  Text,
} from '@hubspot/ui-extensions';
import { hubspot } from '@hubspot/ui-extensions';
import type { CrmContext, ExtensionPointApiActions } from '@hubspot/ui-extensions';
import { SyncStatusPanel } from './integration/SyncStatusPanel.js';
import { useTicketSyncStatus } from './integration/useTicketSyncStatus.js';

interface CrmExtensionProps {
  context: CrmContext;
  actions: ExtensionPointApiActions<'crm.record.tab'>;
}

// HubSpot mounts this extension inside the ticket record tab.
hubspot.extend<'crm.record.tab'>(({ context, actions }: CrmExtensionProps) => (
  <CrmExtension context={context} actions={actions} />
));

const CrmExtension = ({ context, actions }: CrmExtensionProps) => {
  const contextData = context as unknown as Record<string, unknown>;
  // HubSpot context shape can differ by runtime, so we support both common id fields.
  const ticketId = String(contextData.objectId ?? contextData.recordId ?? '');
  const { isLoading, isRefreshing, error, data, refresh } = useTicketSyncStatus(
    ticketId,
    actions,
  );

  return (
    <Box>
      <Heading>Ticket Integration Status</Heading>
      <Text>
        Live sync state for this HubSpot ticket and its latest external webhook event.
      </Text>
      <Divider />
      <SyncStatusPanel
        ticketId={ticketId}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        error={error}
        data={data}
        onRefresh={() => {
          // Keep click handler sync-safe while still running async refresh logic.
          void refresh();
        }}
      />
    </Box>
  );
};
