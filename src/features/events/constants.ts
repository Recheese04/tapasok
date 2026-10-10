export const EVENT_TONE = { DRAFT: "gray", PUBLISHED: "green", CANCELLED: "red" } as const;
export const eventStatusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
