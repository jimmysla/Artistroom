import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT } from "../../shared/event.js";
export async function getEvent() {
  const [settings] = await db.select().from(eventSettings).limit(1);
  return settings ?? DEFAULT_EVENT;
}
