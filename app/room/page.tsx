import { api } from "@/convex/_generated/api";
import { getAuthToken } from "@/lib/auth";
import { RoomList } from "@/room/room-list";
import { preloadQuery } from "convex/nextjs";

export default async function RoomsPage() {
  try {
    const token = await getAuthToken();
    const query = await preloadQuery(api.rooms.getManyByUser, {}, { token });
    return (
      <div>
        <h2 className="mx-auto w-max text-2xl">Welcome to the rooms page</h2>
        <div className="mt-16 grid place-items-center">
          <RoomList query={query} />
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="flex flex-col items-center justify-center">
        <h2 className="text-2xl">Error</h2>
        <p className="text-lg">There was an error fetching rooms</p>
      </div>
    );
  }
}
