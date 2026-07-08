import {
  getCorrelationId,
  runWithCorrelationId,
} from '../../../src/common/correlation/correlation-context';

describe('correlation-context', () => {
  it('returns undefined outside any correlation context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('returns the active correlation id inside runWithCorrelationId', () => {
    runWithCorrelationId('abc-123', () => {
      expect(getCorrelationId()).toBe('abc-123');
    });
  });

  it('propagates the correlation id across an async boundary', async () => {
    await runWithCorrelationId('async-id', async () => {
      await Promise.resolve();
      expect(getCorrelationId()).toBe('async-id');
    });
  });

  it('isolates concurrent correlation contexts from each other', async () => {
    const results: string[] = [];

    await Promise.all([
      runWithCorrelationId('first', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(getCorrelationId() ?? 'missing');
      }),
      runWithCorrelationId('second', async () => {
        await Promise.resolve();
        results.push(getCorrelationId() ?? 'missing');
      }),
    ]);

    expect(results).toContain('first');
    expect(results).toContain('second');
  });
});
