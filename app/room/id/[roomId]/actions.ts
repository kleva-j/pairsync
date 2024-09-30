"use server";

import { auth } from "@clerk/nextjs/server";
import { StreamChat } from "stream-chat";
import { env } from "env.mjs";

export async function generateToken() {
  const { userId } = auth();

  if (!userId) throw new Error("User not authenticated");

  const api_key = env.NEXT_PUBLIC_GETSTREAM_API_KEY;
  const api_secret = env.GETSTREAM_API_SECRET;

  const serverClient = StreamChat.getInstance(api_key, api_secret);
  const token = serverClient.createToken(userId);

  return token;
}
