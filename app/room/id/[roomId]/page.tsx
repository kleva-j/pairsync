import { getRoomQuery } from "@/room/data-access";
import { PageContent } from "@/room/id/[roomId]/component";

type RoomPageProps = { params: { roomId: string } };

export default async function RoomPage({ params }: RoomPageProps) {
  const { success, query } = await getRoomQuery(params.roomId);

  if (success && query) return <PageContent query={query} />;

  return (
    <div className="flex h-52 items-center justify-center">
      <h1>Error</h1>
      <p>There was an error fetching the room</p>
    </div>
  );
}
