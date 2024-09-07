import { DrizzleAdapter } from "@auth/drizzle-adapter";

import type { NextAuthConfig } from "next-auth";

import NextAuth from "next-auth";
import db from "@/db/index";
import config from "auth.config";

export const authConfig = { adapter: DrizzleAdapter(db), ...config } as NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
