import type { DataSource } from 'typeorm';

// All e2e spec files run against the *same* live Postgres container
// (see candidate/service/CLAUDE.md). A blanket `DELETE FROM orders` in
// afterEach works when only one `test:e2e` process runs at a time, but
// two concurrent invocations (two terminals, or a CI job overlapping a
// local run) race: one process's cleanup deletes rows a concurrent
// process is still mid-test with. Confirmed empirically — 5 concurrent
// `npm run test:e2e` processes reliably failed 3-5 of 5 with a mix of
// 500s and FK-constraint errors, reproducing what a prior "transient
// contention" conclusion in TASKS.md incorrectly wrote off as
// unexplainable. Scoping cleanup to only the partnerIds *this* test run
// created removes the hazard regardless of how many processes run
// concurrently, since every test generates its own random partnerId.
export function createPartnerIdTracker() {
  const partnerIds: string[] = [];

  return {
    track(partnerId: string): string {
      partnerIds.push(partnerId);
      return partnerId;
    },
    async cleanup(dataSource: DataSource): Promise<void> {
      if (partnerIds.length === 0) {
        return;
      }
      await dataSource.query(
        `DELETE FROM order_status_audit
         WHERE order_id IN (SELECT id FROM orders WHERE partner_id = ANY($1::uuid[]))`,
        [partnerIds],
      );
      await dataSource.query(
        'DELETE FROM orders WHERE partner_id = ANY($1::uuid[])',
        [partnerIds],
      );
      partnerIds.length = 0;
    },
  };
}
