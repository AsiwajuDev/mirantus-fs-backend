import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_status_audit')
export class OrderStatusAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK to orders.id — no @ManyToOne relation here by design (avoids
  // implicit joins); the REFERENCES orders(id) constraint itself must
  // be added at the DB level in the migration, not left implicit.
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'previous_status', type: 'text', nullable: true })
  previousStatus!: string | null;

  @Column({ name: 'new_status', type: 'text' })
  newStatus!: string;

  @Column({ name: 'changed_by', type: 'text' })
  changedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
