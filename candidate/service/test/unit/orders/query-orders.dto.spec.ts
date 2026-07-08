import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryOrdersDto } from '../../../src/orders/dto/query-orders.dto';

describe('QueryOrdersDto', () => {
  it('defaults page and pageSize when omitted', async () => {
    const dto = plainToInstance(QueryOrdersDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('passes validation with all filters present', async () => {
    const dto = plainToInstance(QueryOrdersDto, {
      status: 'accepted',
      partnerId: 'b3f1c2e4-0000-4000-8000-000000000001',
      page: '2',
      pageSize: '50',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it('rejects an invalid status', async () => {
    const dto = plainToInstance(QueryOrdersDto, { status: 'bogus' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects a non-UUID partnerId', async () => {
    const dto = plainToInstance(QueryOrdersDto, { partnerId: 'not-a-uuid' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'partnerId')).toBe(true);
  });

  it('rejects a zero or negative page', async () => {
    const dto = plainToInstance(QueryOrdersDto, { page: '0' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects a non-integer page', async () => {
    const dto = plainToInstance(QueryOrdersDto, { page: '1.5' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects a zero or negative pageSize', async () => {
    const dto = plainToInstance(QueryOrdersDto, { pageSize: '-1' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('rejects a non-integer pageSize', async () => {
    const dto = plainToInstance(QueryOrdersDto, { pageSize: '20.5' });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('does not reject an over-large pageSize at the DTO level (clamped in the service instead)', async () => {
    const dto = plainToInstance(QueryOrdersDto, { pageSize: '500' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pageSize).toBe(500);
  });
});
