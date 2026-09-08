"use server";

import { redirect } from "next/navigation";
import { checkPassword, createSession, destroySession } from "@/lib/auth";

export async function login(_state: { error?: string }, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!password || !checkPassword(password)) {
    return { error: "Неверный пароль" };
  }
  await createSession();
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
