import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type SignalDataTypeMap } from "baileys";
import type { Sql } from "../db/pool";

/**
 * WhatsApp linked-device login kept in PostgreSQL (table whatsapp_auth) instead of files, so it
 * survives restarts and redeploys. Same shape as Baileys' own useMultiFileAuthState.
 */
export async function dbAuthState(sql: Sql) {
  const read = async (key: string) => {
    const r = await sql.one<{ value: string }>("SELECT value FROM whatsapp_auth WHERE key = $1", [key]);
    return r ? JSON.parse(r.value, BufferJSON.reviver) : null;
  };
  const write = (key: string, data: unknown) =>
    sql.query("INSERT INTO whatsapp_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, JSON.stringify(data, BufferJSON.replacer)]);

  const creds: AuthenticationCreds = (await read("creds")) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const out: { [id: string]: SignalDataTypeMap[T] } = {};
          if (!ids.length) return out;
          const rows = await sql.query<{ key: string; value: string }>("SELECT key, value FROM whatsapp_auth WHERE key = ANY($1::text[])", [ids.map((id) => `${type}:${id}`)]);
          for (const r of rows) {
            let value = JSON.parse(r.value, BufferJSON.reviver);
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            out[r.key.slice(type.length + 1)] = value;
          }
          return out;
        },
        set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) => {
          for (const type in data) {
            const items = data[type as keyof SignalDataTypeMap]!;
            for (const id in items) {
              const value = items[id];
              if (value) await write(`${type}:${id}`, value);
              else await sql.query("DELETE FROM whatsapp_auth WHERE key = $1", [`${type}:${id}`]);
            }
          }
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}

/** Forget the linked account (after logging out, or to link a different phone). */
export const clearAuth = (sql: Sql) => sql.query("DELETE FROM whatsapp_auth");

/** Has a phone been linked (QR scanned) at some point? */
export async function isLinked(sql: Sql) {
  const r = await sql.one<{ value: string }>("SELECT value FROM whatsapp_auth WHERE key = 'creds'");
  return !!r && !!(JSON.parse(r.value, BufferJSON.reviver) as AuthenticationCreds).me?.id;
}
