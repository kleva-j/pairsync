import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

import schema from "./schema";

import { mutateWithUser, queryWithUser } from "./utils";

// INTERNAL QUERIES
export const getMany = internalQuery({
  args: {},
  handler: async ({ db }) => {
    const rooms = await db.query("rooms").order("desc").take(100);
    return rooms;
  },
});

export const getOne = internalQuery({
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
export const getManyByUser = queryWithUser({
  args: {},
  handler: async ({ db, identity }) => {
    const rooms = await db
      .query("rooms")
      .withIndex("by_user", (q) => q.eq("ownerId", identity.tokenIdentifier))
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

// ROOMS MUTATIONS

const roomFields = schema.tables.rooms.validator.fields;
const { ownerId: _ownerId, ...createRoomFields } = roomFields;

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
