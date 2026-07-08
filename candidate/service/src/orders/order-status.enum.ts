export const ORDER_STATUSES = [
  'received',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Single source of truth per SPEC.md §3 — imported by both TransitionGuard
// and its unit tests, never redefined. Self-transitions are intentionally
// absent, not an oversight (see §3: handled by the catch-all 409).
export const VALID_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  received: ['accepted', 'rejected'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};
