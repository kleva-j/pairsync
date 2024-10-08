"use client";

import { useUser } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import {
  ALL_ROOMS_URL,
  SEARCH_ROOMS_URL,
  searchSchema,
  type SearchSchema,
} from "@/lib/contant";

import { RoomCard } from "@/room/room-card";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";

type ContentProps = {
  query: Preloaded<typeof api.rooms.getManyByUser>;
  defaultValues: SearchSchema;
};

export const PageContent = ({ query, defaultValues }: ContentProps) => {
  const rooms = usePreloadedQuery(query);

  const querySearch = useSearchParams();
  const router = useRouter();

  const { isLoaded, user } = useUser();

  const [loading, setLoading] = useState(false);

  const form = useForm({ defaultValues, resolver: zodResolver(searchSchema) });

  function handleSearch({ search }: SearchSchema) {
    setLoading(true);
    router.push(`${SEARCH_ROOMS_URL}${search}`);
    setLoading(false);
  }

  const getAccessLevel = (ownerId: string): "guest" | "owner" | "member" => {
    if (!isLoaded) return "guest";
    const id = ownerId.split("|")[1];
    return id === user?.id ? "owner" : "guest";
  };

  const deleteRoomMutation = useMutation(api.rooms.remove);

  const deleteRoom = useCallback(
    async (roomId: string) => {
      const id = roomId as Id<"rooms">;
      toast.promise(deleteRoomMutation({ roomId: id }), {
        loading: "Loading...",
        success: "Room deleted successfully!",
        error: "Error deleting room!",
      });
    },
    [deleteRoomMutation]
  );

  return (
    <Fragment>
      <Form {...form}>
        <form
          className="mb-8 mt-6 flex w-full max-w-[843px] items-center gap-x-6"
          onSubmit={form.handleSubmit(handleSearch)}
        >
          <FormField
            name="search"
            control={form.control}
            render={({ field }) => (
              <FormItem className="relative w-full max-w-md space-y-0">
                <FormControl>
                  <>
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                      <SearchIcon className="pointer-events-none size-4 text-muted-foreground" />
                    </div>
                    <Input
                      className="relative pl-10"
                      placeholder="Filter rooms by keyword, e.g. React, Next.js, Svelte"
                      {...field}
                    ></Input>
                  </>
                </FormControl>
              </FormItem>
            )}
          />
          <Button
            variant="secondary"
            type="submit"
            className="flex items-center gap-x-2"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Search
          </Button>
          {querySearch.get("search") && (
            <Button
              variant="link"
              className="px-0"
              onClick={() => {
                form.reset();
                router.push(ALL_ROOMS_URL);
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </Form>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.isArray(rooms)
          ? rooms.map((room) => (
              <RoomCard
                key={room._id}
                deleteRoom={deleteRoom}
                room={{ ...room, id: room._id }}
                accessLevel={getAccessLevel(room.ownerId)}
              />
            ))
          : null}
      </div>
    </Fragment>
  );
};
