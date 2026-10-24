import { getActor } from "@/server/auth";
import { handler } from "@/server/http";
import { logout } from "@/server/services/account";

export const POST = handler(async () => {
  await logout(await getActor());
  return { ok: true };
});
