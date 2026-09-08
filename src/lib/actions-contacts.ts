"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { citySlug, cleanName, normalizeEmail, normalizePhone } from "@/lib/normalize";

export async function updateContact(_state: { error?: string; ok?: boolean }, formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  const rawCity = String(formData.get("city") ?? "").trim();

  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) return { error: "Телефон не распознан" };
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) return { error: "E-mail не распознан" };

  let cityId: string | null = null;
  if (rawCity) {
    const name = cleanName(rawCity);
    const slug = name ? citySlug(name) : "";
    if (name && slug) {
      const city = await prisma.city.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
      });
      cityId = city.id;
    }
  }

  // Телефон и e-mail уникальны: если такой уже есть у другого человека — говорим об этом.
  const clash = await prisma.contact.findFirst({
    where: {
      id: { not: id },
      OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(
        Boolean,
      ) as { phone?: string; email?: string }[],
    },
  });
  if (clash) {
    return { error: "Такой телефон или e-mail уже записан на другого пользователя" };
  }

  await prisma.contact.update({
    where: { id },
    data: {
      name: cleanName(String(formData.get("name") ?? "")),
      phone,
      phoneRaw: rawPhone || null,
      email,
      cityId,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteContact(formData: FormData) {
  await requireAuth();
  await prisma.contact.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/contacts");
  redirect("/contacts");
}
