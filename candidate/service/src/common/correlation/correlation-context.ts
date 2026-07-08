import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationStore {
  correlationId: string;
}

// A per-request correlation ID needs to reach arbitrary service-layer
// log calls (e.g. OrdersService.createOrder's warn log) that have no
// direct access to the request object. AsyncLocalStorage does that
// without making every provider REQUEST-scoped, which nestjs-architecture
// flags as a throughput cost to avoid unless genuinely necessary.
const storage = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
