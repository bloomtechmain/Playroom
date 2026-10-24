import { connection } from "next/server";
import { handler } from "@/server/http";
import { demoAccounts } from "@/server/services/account";

/** Demo login screen: clickable account list (empty unless DEMO_MODE=true). */
export const GET = handler(async () => {
  await connection();
  return demoAccounts();
});
