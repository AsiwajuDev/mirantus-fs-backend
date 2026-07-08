export const PRIORITIES = ['routine', 'urgent'] as const;

export type Priority = (typeof PRIORITIES)[number];
