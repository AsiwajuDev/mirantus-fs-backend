import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

import { ORDER_STATUSES, type OrderStatus } from '../order-status.enum';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export class QueryOrdersDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: 'b3f1c2e4-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // No @Max here — SPEC.md §4 requires an over-large pageSize to clamp
  // to MAX_PAGE_SIZE (in the service), not reject with 400, unlike every
  // other out-of-range value on this DTO.
  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
