import { requireActor } from "@/server/auth";
import { db } from "@/server/db";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { notInPractice } from "@/server/practice";
import { folderBackupBody } from "@/server/schemas";
import { folderBackup } from "@/server/services/admin";
import { exportSnapshot } from "@/server/snapshot";

/** End-of-day snapshot for the PC's backup folder (sign-out / shift close); logged, not stored on the server. */
export const POST = handler(async (req) => {
  const actor = await requireActor("settings.edit", "backups.save");
  const { reason } = await readBody(req, folderBackupBody);
  return mutate(actor, (m) => folderBackup(m, reason));
});

/** The same snapshot for the automatic saves while the app is open — read-only, so it doesn't count as a change itself. */
export const GET = handler(async () => {
  await requireActor("settings.edit", "backups.save");
  notInPractice("Backing up");
  return new Response(JSON.stringify(await exportSnapshot(db)), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
