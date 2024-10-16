import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";

import { Rooms } from "./schema";
import { mutateWithUser, queryWithUser } from "./utils";

// INTERNAL QUERIES
export const getManyInternal = internalQuery({
  handler: async ({ db }) => {
    const rooms = await db.query("rooms").order("desc").collect();
    return rooms;
  },
});

export const getOneInternal = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async ({ db }, { roomId }) => {
    const room = await db
      .query("rooms")
      .filter((q) => q.eq(q.field("_id"), roomId))
      .collect();
    return room;
  },
});

// ROOMS QUERIES
export const getMany = queryWithUser({
  args: {},
  handler: async ({ db }) => {
    const rooms = await db.query("rooms").order("desc").collect();
    return rooms;
  },
});

export const getOne = queryWithUser({
  args: { roomId: v.id("rooms") },
  handler: async ({ db }, { roomId }) => {
    const room = await db
      .query("rooms")
      .filter((q) => q.eq(q.field("_id"), roomId))
      .collect();
    return room;
  },
});

export const getManyByUser = queryWithUser({
  args: {},
  handler: async ({ db, identity }) => {
    const rooms = await db
      .query("rooms")
      .withIndex("by_user", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .order("desc")
      .collect();
    return rooms;
  },
});

export const getOneByUser = queryWithUser({
  args: { roomId: v.id("rooms") },
  handler: async ({ db, identity }, { roomId }) => {
    const room = await db
      .query("rooms")
      .withIndex("by_user", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .filter((q) => q.eq(q.field("_id"), roomId))
      .unique();
    return room;
  },
});

export const searchByName = queryWithUser({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    return await ctx.db
      .query("rooms")
      .withSearchIndex("by_name", (q) => q.search("name", query))
      .collect();
  },
});

export const searchByLanguage = queryWithUser({
  args: { query: v.string() },
  handler(ctx, { query }) {
    return ctx.db
      .query("rooms")
      .withSearchIndex("by_language", (q) => q.search("language", query))
      .collect();
  },
});

export const searchByTags = queryWithUser({
  args: { query: v.string() },
  handler(ctx, { query }) {
    return ctx.db
      .query("rooms")
      .withSearchIndex("by_tags", (q) => q.search("tags", query))
      .collect();
  },
});

// ROOMS MUTATIONS

const { ownerId: _ownerIds, ...createRoomFields } = Rooms.withoutSystemFields;

export const create = mutateWithUser({
  args: createRoomFields,
  returns: v.id("rooms"),
  handler: async ({ db, identity }, args) => {
    const { name, description, language, githubRepo, tags } = args;
    const input = { name, description, language, githubRepo, tags };
    const room = await db.insert("rooms", {
      ownerId: identity.tokenIdentifier,
      ...input,
    });
    return room;
  },
});

export const remove = mutateWithUser({
  args: { roomId: v.id("rooms") },
  returns: v.id("rooms"),
  handler: async ({ db, identity }, { roomId }) => {
    const room = await db.get(roomId);
    if (!room || room.ownerId !== identity.tokenIdentifier) {
      throw new ConvexError(
        room ? "Can only delete own room" : `Room ID ${roomId} not found`
      );
    }
    await db.delete(roomId);
    return room._id;
  },
});
