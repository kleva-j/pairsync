import { getRoomsQuery } from "@/room/_data-access";
import { RoomList } from "@/room/room-list";

export default async function RoomsPage() {
  const { success, query } = await getRoomsQuery();

  if (success && query) {
    return (
      <div>
        <h2 className="mx-auto w-max text-2xl">Welcome to the rooms page</h2>
        <div className="mt-16 grid place-items-center">
          <RoomList query={query} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <h2 className="text-2xl">Error</h2>
      <p className="text-lg">There was an error fetching rooms</p>
    </div>
  );
}
