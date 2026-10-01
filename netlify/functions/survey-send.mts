import type { Config } from "@netlify/functions";
import { logError } from "../lib/http.js";
import { sendSurveyIfDue } from "../lib/survey.js";

// Every 15 minutes: sends the survey invitation once the configured date/time is reached.
export default async () => {
  await sendSurveyIfDue().catch((err) => logError("Scheduled survey send failed", err));
};

export const config: Config = { schedule: "*/15 * * * *" };
