import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersAndAuditTables1783512134007 implements MigrationInterface {
  name = 'CreateOrdersAndAuditTables1783512134007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "orders_priority_enum" AS ENUM ('routine', 'urgent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "orders_status_enum" AS ENUM ('received', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" uuid NOT NULL,
        "patient_reference" varchar(255) NOT NULL,
        "requested_location" varchar(255) NOT NULL,
        "priority" "orders_priority_enum" NOT NULL,
        "status" "orders_status_enum" NOT NULL DEFAULT 'received',
        "idempotency_key" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_orders_idempotency_key"
      ON "orders" ("partner_id", "idempotency_key")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_orders_partner_status"
      ON "orders" ("partner_id", "status")
    `);

    // ON DELETE CASCADE: there is no order-delete endpoint in SPEC.md
    // (§8), so this path is currently unreachable in practice. Chosen
    // over RESTRICT as the harmless default for an unreachable case,
    // not because audit rows should disappear with their order.
    await queryRunner.query(`
      CREATE TABLE "order_status_audit" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "previous_status" text,
        "new_status" text NOT NULL,
        "changed_by" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_status_audit"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "orders_priority_enum"`);
  }
}
