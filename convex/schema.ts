import { Table } from "convex-helpers/server";
import { defineSchema } from "convex/server";
import { v } from "convex/values";

export const Users = Table("users", {
  name: v.string(),
  email: v.string(),
  tokenIdentifier: v.string(),
});

export const Rooms = Table("rooms", {
  name: v.string(),
  description: v.optional(v.string()),
  ownerId: v.string(),
  language: v.string(),
  githubRepo: v.optional(v.string()),
  tags: v.array(v.object({ value: v.string(), label: v.string() })),
});

export const RoomMembers = Table("roomMembers", {
  userId: v.id("users"),
  roomId: v.id("rooms"),
  role: v.string(),
});

export default defineSchema({
  rooms: Rooms.table
    .index("by_user", ["ownerId"])
    .searchIndex("by_name", { searchField: "name" })
    .searchIndex("by_tags", { searchField: "tags" })
    .searchIndex("by_language", { searchField: "language" }),
  users: Users.table.index("by_token", ["tokenIdentifier"]),
  roomMembers: RoomMembers.table.index("by_room", ["roomId"]),
});
