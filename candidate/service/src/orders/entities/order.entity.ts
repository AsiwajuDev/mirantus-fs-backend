import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { ORDER_STATUSES, type OrderStatus } from '../order-status.enum';
import { PRIORITIES, type Priority } from '../priority.enum';

@Entity('orders')
@Unique('idx_orders_idempotency_key', ['partnerId', 'idempotencyKey'])
@Index('idx_orders_partner_status', ['partnerId', 'status'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'partner_id', type: 'uuid' })
  partnerId!: string;

  @Column({ name: 'patient_reference', type: 'varchar', length: 255 })
  patientReference!: string;

  @Column({ name: 'requested_location', type: 'varchar', length: 255 })
  requestedLocation!: string;

  @Column({ type: 'enum', enum: PRIORITIES, enumName: 'orders_priority_enum' })
  priority!: Priority;

  @Column({
    type: 'enum',
    enum: ORDER_STATUSES,
    enumName: 'orders_status_enum',
    default: 'received',
  })
  status!: OrderStatus;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
