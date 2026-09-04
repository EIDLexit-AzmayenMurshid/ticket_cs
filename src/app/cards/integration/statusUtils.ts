// 15 minutes without sync updates is treated as a potential webhook delivery delay.
export const WEBHOOK_DELAY_THRESHOLD_MS = 15 * 60 * 1000;

export function hasWebhookDelay(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) {
    return false;
  }

  const parsed = Date.parse(lastSyncAt);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return Date.now() - parsed > WEBHOOK_DELAY_THRESHOLD_MS;
}

// Maps backend sync status labels to UI status tag variants.
export function getSyncStatusVariant(syncStatus: string): 'success' | 'warning' | 'danger' {
  if (syncStatus === 'synced') {
    return 'success';
  }

  if (syncStatus.includes('missing')) {
    return 'warning';
  }

  return 'danger';
}
