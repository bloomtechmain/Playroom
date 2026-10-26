import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { downloadBackup } from "@/server/services/admin";

export const GET = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  // backups.save: the daily backups are copied into the backup folder on the PC of whoever is signed in
  await requireActor("settings.edit", "backups.save");
  const { id } = await params;
  const { at, snapshot } = await downloadBackup(id);
  const name = `playroom-backup-${at.slice(0, 16).replace(":", "")}.json`;
  return new Response(JSON.stringify(snapshot), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
