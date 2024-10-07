import { CreateRoomButton } from "@/room/create-room-button";
import { getRoomsQuery, searchRoomsQuery } from "@/room/data-access";
import { PageContent } from "@/room/page-content";

type PageProps = {
  searchParams?: { search?: string };
};

export default async function RoomsPage({ searchParams }: PageProps) {
  const { search } = searchParams || {};
  let data;

  if (search && search.length > 0) data = await searchRoomsQuery(search);
  else data = await getRoomsQuery();

  const { success, query } = data;

  if (!success || !query) {
    return (
      <div className="flex flex-col items-center justify-center">
        <h2 className="text-2xl">Error</h2>
        <p className="text-lg">There was an error fetching rooms</p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid place-items-center">
      <div className="flex w-full max-w-[843px] items-center justify-between gap-4">
        <h2 className="text-3xl font-medium">Find Rooms</h2>
        <CreateRoomButton />
      </div>
      <PageContent query={query} defaultValues={{ search: search || "" }} />
    </div>
  );
}
