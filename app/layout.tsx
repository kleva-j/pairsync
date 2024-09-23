import { ClerkProvider } from "@clerk/nextjs";

import dynamic from "next/dynamic";

import { AxiomWebVitals } from "next-axiom";
import { ViewTransitions } from "next-view-transitions";

import NextTopLoader from "nextjs-toploader";

import type { PropsWithChildren } from "react";

import { Toaster } from "sonner";

// Providers
import { ConvexClientProvider } from "@/components/providers/convex";
import { ErrorBoundary } from "@/components/providers/error-boundary";
import { PHProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

import { fontMono, fontSans } from "@/lib/font";
import { cn } from "@/lib/utils";
import { env } from "env.mjs";

import "styles/tailwind.css";

const PostHogPageView = dynamic(() => import("@/components/posthog-page-view"), {
  ssr: false,
});

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning>
        <PHProvider>
          <body
            className={cn(
              "min-h-screen bg-white font-sans antialiased dark:bg-black",
              fontSans.variable,
              fontMono.variable
            )}
          >
            <PostHogPageView />
            <AxiomWebVitals />
            <ErrorBoundary>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <NextTopLoader />
                <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
                  <ConvexClientProvider>{children}</ConvexClientProvider>
                </ClerkProvider>
                <Toaster />
              </ThemeProvider>
            </ErrorBoundary>
          </body>
        </PHProvider>
      </html>
    </ViewTransitions>
  );
}
