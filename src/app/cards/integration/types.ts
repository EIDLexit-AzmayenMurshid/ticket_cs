// Response contract returned by the private sync-status app function.
export interface SyncStatusResponse {
  success: boolean;
  ticketId?: string;
  syncStatus?: string;
  lastSyncAt?: string | null;
  lastSyncResult?: string | null;
  lastWebhookEventId?: string | null;
  sourceSystem?: string | null;
  externalTicketId?: string | null;
  subject?: string | null;
  priority?: string | null;
  pipeline?: string | null;
  stage?: string | null;
  ownerId?: string | null;
  missingMappings?: string[];
  error?: string;
}

// Local UI state model used by the card while loading/refetching sync status.
export interface SyncState {
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  data: SyncStatusResponse | null;
}
