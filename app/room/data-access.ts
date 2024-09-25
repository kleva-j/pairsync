import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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

export const getRoomQuery = async (id: string) => {
  try {
    const token = await getAuthToken();
    const query = await preloadQuery(
      api.rooms.getOneByUser,
      { roomId: id as Id<"rooms"> },
      { token }
    );
    return { query, success: true };
  } catch (error) {
    return { success: false };
  }
};
