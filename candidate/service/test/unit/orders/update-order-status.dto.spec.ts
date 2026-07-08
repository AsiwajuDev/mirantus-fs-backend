import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateOrderStatusDto } from '../../../src/orders/dto/update-order-status.dto';

describe('UpdateOrderStatusDto', () => {
  it('passes validation for every valid status value', async () => {
    for (const status of [
      'received',
      'accepted',
      'in_progress',
      'completed',
      'rejected',
      'cancelled',
    ]) {
      const dto = plainToInstance(UpdateOrderStatusDto, { status });
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('rejects a status outside the six known values', async () => {
    const dto = plainToInstance(UpdateOrderStatusDto, { status: 'bogus' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects a missing status', async () => {
    const dto = plainToInstance(UpdateOrderStatusDto, {});

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
