import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { ORDER_STATUSES, type OrderStatus } from '../order-status.enum';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;
}
