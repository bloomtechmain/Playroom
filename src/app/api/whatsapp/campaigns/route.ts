import { z } from "zod";
import { requireActor } from "@/server/auth";
import { db } from "@/server/db";
import { readSettings } from "@/server/snapshot";
import { badRequest, handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { audienceOf, queueCampaign } from "@/server/whatsapp/messages";

const audience = z.object({
  segment: z.enum(["all", "members", "recent", "kids_age", "birthday_month"]),
  days: z.number().int().min(1).max(3650).optional(),
  minAge: z.number().int().min(0).max(18).optional(),
  maxAge: z.number().int().min(0).max(18).optional(),
});
const body = z.object({
  audience,
  /** preview only: how many people, and a few names */
  preview: z.boolean().optional(),
  name: z.string().max(120).optional(),
  message: z.string().max(4000).optional(),
  promotionId: z.string().max(100).optional(),
});

/** Bulk promotion: preview the audience, or queue the messages (sent slowly by the worker). */
export const POST = handler(async (req) => {
  const actor = await requireActor("whatsapp.send");
  const b = await readBody(req, body);
  if (b.preview) {
    // read-only: don't bump the revision (every open screen would refresh)
    const people = await audienceOf(db, await readSettings(db), b.audience);
    return { result: { count: people.length, sample: people.slice(0, 8).map((p) => p.name) } };
  }
  return mutate(actor, async (m) => {
    const settings = await m.settings();
    if (!b.message?.trim()) throw badRequest("Write the message");
    const promo = b.promotionId ? await m.get("promotions", b.promotionId, "Promotion") : undefined;
    const name = b.name?.trim() || promo?.name || "Promotion";
    const count = await queueCampaign(m.tx, settings, b.audience, b.message.trim(), promo && { code: promo.code, name: promo.name }, name, actor.id);
    await m.log("WhatsApp", "Campaign", `${name} · ${count} recipient(s)`);
    return { count };
  });
});
