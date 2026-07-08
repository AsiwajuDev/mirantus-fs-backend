import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateOrderDto } from '../../../src/orders/dto/create-order.dto';

function validDto(): Record<string, unknown> {
  return {
    partnerId: 'b3f1c2e4-0000-4000-8000-000000000001',
    patientReference: 'PT-2026-00417',
    requestedLocation: 'Lagos Diagnostics, Ikeja',
    priority: 'routine',
  };
}

describe('CreateOrderDto', () => {
  it('passes validation with a fully valid body', async () => {
    const dto = plainToInstance(CreateOrderDto, validDto());

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID partnerId', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      partnerId: 'not-a-uuid',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'partnerId')).toBe(true);
  });

  it('rejects an empty patientReference', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      patientReference: '',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'patientReference')).toBe(true);
  });

  it('rejects a patientReference over 255 characters', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      patientReference: 'x'.repeat(256),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'patientReference')).toBe(true);
  });

  it('rejects a priority outside routine/urgent', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      priority: 'stat',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });
});
