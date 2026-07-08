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

  // requestedLocation carries the same @IsString/@IsNotEmpty/@MaxLength(255)
  // constraints as patientReference (SPEC.md §2), but had no dedicated
  // coverage anywhere in the suite prior to this — only ever present as
  // valid fixture data.
  it('rejects an empty requestedLocation', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      requestedLocation: '',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'requestedLocation')).toBe(true);
  });

  it('rejects a requestedLocation over 255 characters', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validDto(),
      requestedLocation: 'x'.repeat(256),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'requestedLocation')).toBe(true);
  });

  describe('missing required fields', () => {
    const requiredFields = [
      'partnerId',
      'patientReference',
      'requestedLocation',
      'priority',
    ] as const;

    it.each(requiredFields)(
      'rejects a body missing %s entirely',
      async (field) => {
        const body = validDto();
        delete body[field];
        const dto = plainToInstance(CreateOrderDto, body);

        const errors = await validate(dto);
        expect(errors.some((e) => e.property === field)).toBe(true);
      },
    );
  });
});
