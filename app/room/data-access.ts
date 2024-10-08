import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAuthToken } from "@/lib/auth";
import { preloadQuery } from "convex/nextjs";

export const getRoomsQuery = async () => {
  try {
    const token = await getAuthToken();
    const query = await preloadQuery(api.rooms.getMany, {}, { token });
    return { query, success: true };
  } catch (error) {
    return { success: false };
  }
};

export const getRoomQuery = async (id: string) => {
  const roomId = id as Id<"rooms">;
  try {
    const token = await getAuthToken();
    const query = await preloadQuery(api.rooms.getOneByUser, { roomId }, { token });
    return { query, success: true };
  } catch (error) {
    return { success: false };
  }
};

export const searchRoomsQuery = async (query: string) => {
  try {
    const token = await getAuthToken();
    const request = await preloadQuery(api.rooms.searchByName, { query }, { token });
    return { query: request, success: true };
  } catch (error) {
    return { success: false };
  }
};
