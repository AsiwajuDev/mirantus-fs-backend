import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from '../../../src/health/health.controller';
import type { HealthService } from '../../../src/health/health.service';

describe('HealthController', () => {
  let checkLiveness: jest.Mock;
  let checkReadiness: jest.Mock;
  let controller: HealthController;

  beforeEach(() => {
    checkLiveness = jest.fn().mockReturnValue({ status: 'ok' });
    checkReadiness = jest.fn();
    const healthService = {
      checkLiveness,
      checkReadiness,
    } as unknown as HealthService;

    controller = new HealthController(healthService);
  });

  it('GET /health returns ok', () => {
    expect(controller.checkLiveness()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns ok when the database is reachable', async () => {
    checkReadiness.mockResolvedValue(true);

    await expect(controller.checkReadiness()).resolves.toEqual({
      status: 'ok',
    });
  });

  it('GET /ready throws ServiceUnavailableException when the database is unreachable', async () => {
    checkReadiness.mockResolvedValue(false);

    await expect(controller.checkReadiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
