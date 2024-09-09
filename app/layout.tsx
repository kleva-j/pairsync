import { type PropsWithChildren } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { fontMono, fontSans } from "@/lib/font";
import { cn } from "@/lib/utils";

import "styles/tailwind.css";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-white font-sans antialiased dark:bg-black",
          fontSans.variable,
          fontMono.variable
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
