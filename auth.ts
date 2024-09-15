import type { NextAuthConfig } from "next-auth";

import NextAuth from "next-auth";
import config from "auth.config";

export const authConfig = { ...config } as NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
