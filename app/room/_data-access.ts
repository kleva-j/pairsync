import { api } from "@/convex/_generated/api";
import { getAuthToken } from "@/lib/auth";
import { preloadQuery } from "convex/nextjs";

export const getRoomsQuery = async () => {
  try {
    const token = await getAuthToken();
    const query = await preloadQuery(api.rooms.getManyByUser, {}, { token });
    return { query, success: true };
  } catch (error) {
    return { success: false };
  }
};
