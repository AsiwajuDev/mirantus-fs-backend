import { AppLogger } from '../../../src/common/logging/app-logger.service';
import { runWithCorrelationId } from '../../../src/common/correlation/correlation-context';

describe('AppLogger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let logger: AppLogger;

  beforeEach(() => {
    consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    logger = new AppLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function lastLoggedEntry(spy: jest.SpyInstance): Record<string, unknown> {
    const [line] = spy.mock.calls[spy.mock.calls.length - 1] as [string];
    return JSON.parse(line) as Record<string, unknown>;
  }

  it('writes log() to stdout as structured JSON', () => {
    logger.log('order created');

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry).toMatchObject({ level: 'log', message: 'order created' });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('writes error() to stderr', () => {
    logger.error('something broke');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const entry = lastLoggedEntry(consoleErrorSpy);
    expect(entry).toMatchObject({ level: 'error', message: 'something broke' });
  });

  it('treats a trailing string optional param as context (Nest framework log convention)', () => {
    logger.log('Nest application successfully started', 'NestApplication');

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry).toMatchObject({ context: 'NestApplication' });
  });

  it('flattens an object optional param as metadata (application log convention)', () => {
    logger.warn('Idempotency key replayed with different body', {
      idempotencyKey: 'key-1',
      partnerId: 'partner-a',
    });

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry).toMatchObject({
      idempotencyKey: 'key-1',
      partnerId: 'partner-a',
    });
  });

  it('redacts patientReference wherever it appears in metadata, never logging the real value', () => {
    logger.log('order created', {
      orderId: 'order-1',
      patientReference: 'PT-2026-00417',
      nested: { patientReference: 'PT-2026-00417' },
    });

    const entry = lastLoggedEntry(consoleLogSpy);
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('PT-2026-00417');
    expect(entry.patientReference).toBe('[REDACTED]');
    expect((entry.nested as Record<string, unknown>).patientReference).toBe(
      '[REDACTED]',
    );
  });

  it('redacts the primary message argument if it merely mentions patientReference', () => {
    // Regression (found by @security-auditor): key-name redaction alone
    // misses a raw string that embeds the field name and its value
    // together, e.g. a Postgres constraint-violation message —
    // `Key (patient_reference)=(PT-2026-00417) already exists.`
    logger.error('Key (patient_reference)=(PT-2026-00417) already exists.');

    const entry = lastLoggedEntry(consoleErrorSpy);
    expect(entry.message).toBe('[REDACTED]');
  });

  it('redacts a raw string value nested in metadata that mentions patientReference, not just object keys', () => {
    logger.error('Unhandled exception', {
      error: 'duplicate key value violates patient_reference constraint',
    });

    const entry = lastLoggedEntry(consoleErrorSpy);
    expect(entry.error).toBe('[REDACTED]');
  });

  it('leaves unrelated messages and metadata untouched', () => {
    logger.log('order created', { orderId: 'order-1', status: 'received' });

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry.message).toBe('order created');
    expect(entry.orderId).toBe('order-1');
    expect(entry.status).toBe('received');
  });

  it('redacts patientReference inside an array of objects', () => {
    logger.log('bulk import', {
      orders: [
        { orderId: 'order-1', patientReference: 'PT-2026-00417' },
        { orderId: 'order-2', patientReference: 'PT-2026-00418' },
      ],
    });

    const entry = lastLoggedEntry(consoleLogSpy);
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('PT-2026-00417');
    expect(serialized).not.toContain('PT-2026-00418');
  });

  it('supports debug() and verbose() levels', () => {
    logger.debug('debugging');
    expect(lastLoggedEntry(consoleLogSpy)).toMatchObject({ level: 'debug' });

    logger.verbose('verbose detail');
    expect(lastLoggedEntry(consoleLogSpy)).toMatchObject({ level: 'verbose' });
  });

  it('includes the active correlation id when present', () => {
    runWithCorrelationId('corr-123', () => {
      logger.log('inside a request');
    });

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry.correlationId).toBe('corr-123');
  });

  it('omits correlationId when no request context is active', () => {
    logger.log('outside a request');

    const entry = lastLoggedEntry(consoleLogSpy);
    expect(entry.correlationId).toBeUndefined();
  });
});
