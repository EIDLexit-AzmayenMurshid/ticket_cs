import { hubspot, logger } from '@hubspot/ui-extensions';
import type { ExtensionPointApiActions } from '@hubspot/ui-extensions';
import { useCallback, useEffect, useState } from 'react';
import type { SyncState, SyncStatusResponse } from './types.js';

// Fetches ticket sync data from a private HubSpot function and exposes UI-friendly state.
export function useTicketSyncStatus(
  ticketId: string,
  actions: ExtensionPointApiActions<'crm.record.tab'>,
): SyncState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<SyncState>({
    isLoading: true,
    isRefreshing: false,
    error: null,
    data: null,
  });

  const loadSyncStatus = useCallback(
    async (refreshOnly: boolean) => {
      // If ticket id is unavailable, return an immediate UI error state.
      if (!ticketId) {
        setState({
          isLoading: false,
          isRefreshing: false,
          error: 'This card could not determine the current HubSpot ticket ID.',
          data: null,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        error: null,
        // Initial load shows full spinner; manual refresh only toggles refresh button state.
        isLoading: refreshOnly ? prev.isLoading : true,
        isRefreshing: refreshOnly,
      }));

      try {
        // Calls the private app-function by uid, not an external HTTP endpoint.
        const response = await hubspot.serverless<SyncStatusResponse>(
          'ticket_cs_sync_status_function',
          {
            parameters: { ticketId },
          },
        );

        if (!response?.success) {
          throw new Error(response?.error || 'Sync status endpoint did not return success.');
        }

        setState({
          isLoading: false,
          isRefreshing: false,
          error: null,
          data: response,
        });

        if (refreshOnly && actions?.addAlert) {
          // User feedback for manual refresh completion.
          actions.addAlert({
            type: 'success',
            title: 'Ticket sync status refreshed',
            message: 'Latest ticket integration data loaded.',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load sync status.';
        logger.error(message);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: message,
        }));
      }
    },
    [actions, ticketId],
  );

  useEffect(() => {
    // Defer initial fetch to avoid synchronous state update in effect body.
    const timer = setTimeout(() => {
      void loadSyncStatus(false);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [loadSyncStatus]);

  const refresh = useCallback(async () => {
    // Exposed refresh action used by the card's Refresh button.
    await loadSyncStatus(true);
  }, [loadSyncStatus]);

  return {
    ...state,
    refresh,
  };
}
