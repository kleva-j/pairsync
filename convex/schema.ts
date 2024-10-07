import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const userSchema = {
  name: v.string(),
  email: v.string(),
  tokenIdentifier: v.string(),
};
export const roomSchema = {
  name: v.string(),
  description: v.optional(v.string()),
  ownerId: v.string(),
  language: v.string(),
  githubRepo: v.optional(v.string()),
  tags: v.array(v.object({ value: v.string(), label: v.string() })),
};
export const roomMemberSchema = {
  userId: v.id("users"),
  roomId: v.id("rooms"),
  role: v.string(),
};

export default defineSchema({
  rooms: defineTable(roomSchema)
    .index("by_user", ["ownerId"])
    .searchIndex("by_name", { searchField: "name" }),
  users: defineTable(userSchema).index("by_token", ["tokenIdentifier"]),
  roomMembers: defineTable(roomMemberSchema).index("by_room", ["roomId"]),
});
