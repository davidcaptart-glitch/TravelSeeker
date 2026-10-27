import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ensureUser } from "./repo";

export async function currentUserId(): Promise<string> {
  // Las páginas con sesión se renderizan siempre en cada petición (usan la hora actual, la BD...).
  await connection();
  const id = (await cookies()).get("ts_uid")?.value;
  if (!id) throw new Error("Sin sesión");
  await ensureUser(id);
  return id;
}

export async function currentUser() {
  return ensureUser(await currentUserId());
}
