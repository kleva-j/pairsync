import { ClerkProvider } from "@clerk/nextjs";
import { ViewTransitions } from "next-view-transitions";

import type { PropsWithChildren } from "react";

import { ErrorBoundary } from "@/components/providers/error-boundary";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { fontMono, fontSans } from "@/lib/font";
import { cn } from "@/lib/utils";
import { env } from "env.mjs";

import "styles/tailwind.css";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning>
        <body
          className={cn(
            "min-h-screen bg-white font-sans antialiased dark:bg-black",
            fontSans.variable,
            fontMono.variable
          )}
        >
          <ErrorBoundary>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
                {children}
              </ClerkProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </body>
      </html>
    </ViewTransitions>
  );
}
