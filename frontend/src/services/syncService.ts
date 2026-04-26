import api from './api';
import { z } from 'zod';

// Validation schemas
export const syncQueueItemSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  entity: z.enum(['invoice', 'stock_movement', 'payment', 'customer', 'product']),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
});

export type SyncQueueItemInput = z.infer<typeof syncQueueItemSchema>;

export interface SyncStatus {
  lastSyncAt?: string;
  pendingItems: number;
  failedItems: number;
  isOnline: boolean;
  syncInProgress: boolean;
}

export interface SyncResult {
  processed: number;
  failed: number;
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
}

export interface QueueItem {
  id: string;
  userId: string;
  operation: 'create' | 'update' | 'delete';
  entity: 'invoice' | 'stock_movement' | 'payment' | 'customer' | 'product';
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  errorMessage?: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

class SyncService {
  // Get sync status
  async getStatus(): Promise<SyncStatus> {
    const response = await api.get<SyncStatus>('/sync/status');
    return response.data;
  }

  // Get pending queue items
  async getPendingItems(): Promise<QueueItem[]> {
    const response = await api.get<QueueItem[]>('/sync/queue');
    return response.data;
  }

  // Trigger sync
  async triggerSync(): Promise<SyncResult> {
    const response = await api.post<SyncResult>('/sync/trigger');
    return response.data;
  }

  // Retry failed items
  async retryFailed(): Promise<SyncResult> {
    const response = await api.post<SyncResult>('/sync/retry');
    return response.data;
  }

  // Resolve conflict
  async resolveConflict(
    itemId: string,
    resolution: 'local' | 'server' | 'merge',
    mergedData?: Record<string, unknown>
  ): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/sync/conflicts/${itemId}/resolve`, {
      resolution,
      mergedData,
    });
    return response.data;
  }

  // Get conflict list
  async getConflicts(): Promise<Array<{
    itemId: string;
    localData: Record<string, unknown>;
    serverData: Record<string, unknown>;
    timestamp: string;
  }>> {
    const response = await api.get('/sync/conflicts');
    return response.data;
  }

  // Check connectivity
  async checkConnectivity(): Promise<{ isOnline: boolean; latency: number }> {
    const startTime = Date.now();
    try {
      await api.get('/health', { timeout: 5000 });
      return {
        isOnline: true,
        latency: Date.now() - startTime,
      };
    } catch {
      return {
        isOnline: false,
        latency: -1,
      };
    }
  }

  // Local storage helpers for offline support
  saveToLocalQueue(item: Omit<SyncQueueItemInput, 'timestamp'> & { timestamp?: string }): void {
    const queue = this.getLocalQueue();
    const newItem: SyncQueueItemInput = {
      ...item,
      timestamp: item.timestamp || new Date().toISOString(),
    };
    queue.push(newItem);
    localStorage.setItem('syncQueue', JSON.stringify(queue));
  }

  getLocalQueue(): SyncQueueItemInput[] {
    const queueStr = localStorage.getItem('syncQueue');
    if (!queueStr) return [];
    try {
      return JSON.parse(queueStr);
    } catch {
      return [];
    }
  }

  clearLocalQueue(): void {
    localStorage.removeItem('syncQueue');
  }

  removeFromLocalQueue(index: number): void {
    const queue = this.getLocalQueue();
    queue.splice(index, 1);
    localStorage.setItem('syncQueue', JSON.stringify(queue));
  }
}

export const syncService = new SyncService();
export default syncService;
