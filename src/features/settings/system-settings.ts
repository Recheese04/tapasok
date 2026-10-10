import "server-only";
import { db } from "@/lib/database/client";

// Admin-editable system settings. Defaults apply until a value is saved.
export const SETTING_DEFAULTS = {
  "school.name": "Your School",
  "attendance.late_grace_minutes": "15",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.systemSetting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value;
  return out as Record<SettingKey, string>;
}

export async function saveSettings(actorId: string, values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values) as [SettingKey, string][];
  await db.$transaction([
    ...entries.map(([key, value]) =>
      db.systemSetting.upsert({ where: { key }, update: { value, updatedById: actorId }, create: { key, value, updatedById: actorId } }),
    ),
    db.auditLog.create({ data: { actorUserId: actorId, action: "settings.update", metadata: { keys: entries.map(([k]) => k) } } }),
  ]);
}
