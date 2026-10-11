import { authed, json } from "@/lib/mobile/api";
import { memberAnnouncements } from "@/lib/mobile/queries";

export const GET = authed(async (user) => json({ announcements: await memberAnnouncements(user, 50) }));
