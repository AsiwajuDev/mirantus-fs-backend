export const ORDER_STATUSES = [
  'received',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
