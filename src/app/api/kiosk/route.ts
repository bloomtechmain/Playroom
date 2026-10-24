import { connection } from "next/server";
import { handler } from "@/server/http";
import { loadKioskState } from "@/server/state";

export const GET = handler(async () => {
  await connection();
  return loadKioskState();
});
