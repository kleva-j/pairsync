import type { NextAuthConfig } from "next-auth";

import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const providers = [GitHub, Google];

export const providerMap = providers.map((provider) => {
  const providerData = provider({});
  return { id: providerData.id, name: providerData.name };
});

export default {
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
} satisfies NextAuthConfig;
