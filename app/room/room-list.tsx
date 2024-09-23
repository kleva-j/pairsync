"use client";

import { RoomCard } from "@/components/room-card";
import { api } from "@/convex/_generated/api";

import { Preloaded, usePreloadedQuery } from "convex/react";

type RoomListProps = {
  query: Preloaded<typeof api.rooms.getManyByUser>;
};

export const RoomList = ({ query }: RoomListProps) => {
  const rooms = usePreloadedQuery(query);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.isArray(rooms)
        ? rooms.map((room) => <RoomCard key={room._id} roomId={room._id} room={room} />)
        : null}
    </div>
  );
};
