import type { User } from "@clerk/backend";

import { currentUser } from "@clerk/nextjs/server";
import { getRoomQuery } from "@/room/data-access";
import { PageContent } from "@/room/id/[roomId]/page-content";

type RoomPageProps = { params: { roomId: string } };

export default async function RoomPage({ params }: RoomPageProps) {
  const { success, query } = await getRoomQuery(params.roomId);
  const { id, fullName: name, imageUrl: image } = (await currentUser()) as User;
  const user = { id, name: name ?? "", image };

  if (success) return query ? <PageContent query={query} user={user} /> : null;

  return (
    <div className="flex h-52 items-center justify-center">
      <h1 className="text-3xl">Error</h1>
      <p className="text-lg">There was an error fetching the room</p>
    </div>
  );
}
