import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { mutate } from "@/server/mutation";
import { connect, disconnect } from "@/server/whatsapp/connection";

/** Start linking: the QR to scan appears in the status a moment later. */
export const POST = handler(async () => {
  const actor = await requireActor("whatsapp.connect");
  await connect();
  await mutate(actor, (m) => m.log("WhatsApp", "Connect", "Started linking the WhatsApp account"));
  return { ok: true };
});

/** Log out the linked phone and forget it. */
export const DELETE = handler(async () => {
  const actor = await requireActor("whatsapp.connect");
  await disconnect();
  await mutate(actor, (m) => m.log("WhatsApp", "Disconnect", "Unlinked the WhatsApp account"));
  return { ok: true };
});
