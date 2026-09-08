import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { citySlug, cleanName, normalizeEmail, normalizePhone } from "@/lib/normalize";

export type IngestInput = {
  botId: string;
  /** chat_id в Telegram / user_id в ВК / любой внешний id. */
  externalId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Имя, которое человек назвал сам (приоритетнее firstName/lastName). */
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
};

type Tx = Prisma.TransactionClient;

async function getOrCreateCity(tx: Tx, rawName: string): Promise<string | null> {
  const name = cleanName(rawName);
  if (!name) return null;
  const slug = citySlug(name);
  if (!slug) return null;
  const city = await tx.city.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
  return city.id;
}

/**
 * Склеивает два контакта: всё, что висело на `dropId`, переезжает на `keepId`,
 * пустые поля `keepId` заполняются из донора. Нужно, когда человек сначала
 * написал в один бот, а потом в другой и оставил там тот же телефон.
 */
async function mergeContacts(tx: Tx, keepId: string, dropId: string): Promise<void> {
  if (keepId === dropId) return;
  const [keep, drop] = await Promise.all([
    tx.contact.findUnique({ where: { id: keepId } }),
    tx.contact.findUnique({ where: { id: dropId } }),
  ]);
  if (!keep || !drop) return;

  await tx.subscriber.updateMany({ where: { contactId: dropId }, data: { contactId: keepId } });
  await tx.message.updateMany({ where: { contactId: dropId }, data: { contactId: keepId } });

  const notes = [keep.notes, drop.notes].filter(Boolean).join("\n") || null;
  await tx.contact.delete({ where: { id: dropId } });
  await tx.contact.update({
    where: { id: keepId },
    data: {
      name: keep.name ?? drop.name,
      phone: keep.phone ?? drop.phone,
      phoneRaw: keep.phoneRaw ?? drop.phoneRaw,
      email: keep.email ?? drop.email,
      cityId: keep.cityId ?? drop.cityId,
      notes,
    },
  });
}

/**
 * Записывает человека из бота: находит существующий контакт по телефону или email,
 * иначе создаёт новый, и отмечает присутствие в этом боте.
 */
export async function ingestContact(input: IngestInput) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const selfName = cleanName(input.name);
  const tgName = cleanName([input.firstName, input.lastName].filter(Boolean).join(" "));

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscriber.findUnique({
      where: { botId_externalId: { botId: input.botId, externalId: input.externalId } },
    });

    const matches = await tx.contact.findMany({
      where: {
        OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(
          Boolean,
        ) as Prisma.ContactWhereInput[],
      },
      orderBy: { createdAt: "asc" },
    });

    let contactId = existing?.contactId ?? matches[0]?.id ?? null;

    if (!contactId) {
      const created = await tx.contact.create({ data: { name: selfName ?? tgName } });
      contactId = created.id;
    }

    // Один человек мог прийти в разные боты и совпасть по телефону/email — склеиваем.
    for (const match of matches) {
      await mergeContacts(tx, contactId, match.id);
    }

    const current = await tx.contact.findUniqueOrThrow({ where: { id: contactId } });
    const cityId = input.city ? await getOrCreateCity(tx, input.city) : null;

    const contact = await tx.contact.update({
      where: { id: contactId },
      data: {
        // Имя, названное самим человеком, важнее имени из профиля.
        name: selfName ?? current.name ?? tgName,
        phone: phone ?? current.phone,
        phoneRaw: input.phone?.trim() || current.phoneRaw,
        email: email ?? current.email,
        cityId: cityId ?? current.cityId,
      },
      include: { city: true },
    });

    const subscriber = await tx.subscriber.upsert({
      where: { botId_externalId: { botId: input.botId, externalId: input.externalId } },
      update: {
        contactId: contact.id,
        username: input.username ?? undefined,
        firstName: cleanName(input.firstName) ?? undefined,
        lastName: cleanName(input.lastName) ?? undefined,
        status: "ACTIVE",
        lastSeenAt: new Date(),
      },
      create: {
        botId: input.botId,
        contactId: contact.id,
        externalId: input.externalId,
        username: input.username ?? null,
        firstName: cleanName(input.firstName),
        lastName: cleanName(input.lastName),
        lastSeenAt: new Date(),
      },
    });

    return { contact, subscriber };
  });
}

export async function logMessage(params: {
  botId: string;
  subscriberId: string;
  contactId: string | null;
  direction: "IN" | "OUT";
  text: string;
  externalId?: string | null;
}) {
  if (!params.text.trim()) return null;
  return prisma.message.create({
    data: {
      botId: params.botId,
      subscriberId: params.subscriberId,
      contactId: params.contactId,
      direction: params.direction,
      text: params.text.slice(0, 4000),
      externalId: params.externalId ?? null,
    },
  });
}
