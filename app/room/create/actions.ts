"use server";

import { api } from "@/convex/_generated/api";
import { getAuthToken } from "@/lib/auth";
import { type CreateRoomFormSchema, createRoomSchema } from "@/lib/contant";
import { fetchMutation } from "convex/nextjs";

export async function createRoomAction(data: CreateRoomFormSchema) {
  const validFields = createRoomSchema.safeParse(data);
  if (!validFields.success) throw new Error("Invalid form data");
  const token = await getAuthToken();
  const result = await fetchMutation(
    api.rooms.create,
    { ...validFields.data },
    { token }
  );
  return { success: true, data: result };
}
