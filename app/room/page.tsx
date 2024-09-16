import { RoomCard } from "@/components/room-card";

export default async function RoomsPage() {
  return (
    <div>
      <h2 className="mx-auto w-max text-2xl">Welcome to the rooms page</h2>
      <div className="mt-16 grid place-items-center">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <RoomCard />
          <RoomCard />
          <RoomCard />
          <RoomCard />
          <RoomCard />
        </div>
      </div>
    </div>
  );
}
