import type { DataSource } from 'typeorm';

import { HealthService } from '../../../src/health/health.service';

describe('HealthService', () => {
  let query: jest.Mock;
  let service: HealthService;

  beforeEach(() => {
    query = jest.fn();
    const dataSource = { query } as unknown as DataSource;
    service = new HealthService(dataSource);
  });

  it('checkLiveness returns ok without touching the database', () => {
    expect(service.checkLiveness()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('checkReadiness returns true when the database responds', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);

    expect(await service.checkReadiness()).toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('checkReadiness returns false when the database query fails', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    expect(await service.checkReadiness()).toBe(false);
  });
});
