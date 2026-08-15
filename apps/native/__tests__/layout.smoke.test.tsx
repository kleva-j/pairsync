import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

// The root layout entry pulls in native modules (expo-router, heroui-native,
// gesture-handler, keyboard-controller, uniwind) that cannot run in a Node
// test process, and react-native itself isn't parseable outside Metro. Mock
// them at the module boundary and render with react-dom/server so the layout's
// own composition is what gets exercised. Host elements are lowercase strings
// so the rendered tree keeps the screen registrations visible.
vi.mock("expo-router", () => {
  const Screen = (props: Record<string, unknown>) => createElement("screen", props);
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) => createElement("stack", null, children),
    { Screen },
  );
  return { Stack };
});

vi.mock("heroui-native", () => ({
  HeroUINativeProvider: ({ children }: { children?: ReactNode }) => children ?? null,
  useThemeColor: () => "#000000",
}));

vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardProvider: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("@/contexts/app-theme-context", () => ({
  AppThemeProvider: ({ children }: { children?: ReactNode }) => children ?? null,
  useAppTheme: () => ({ currentTheme: "dark", isLight: false, isDark: true }),
}));

import Layout, { unstable_settings } from "../app/_layout";

it("exports a valid root layout entry", () => {
  expect(typeof Layout).toBe("function");
  expect(unstable_settings.initialRouteName).toBe("(drawer)");
});

it("renders the root layout with the registered screens", () => {
  const markup = renderToStaticMarkup(createElement(Layout));

  // The (drawer) group and modal screen registered by the entry point survive.
  expect(markup).toContain('name="(drawer)"');
  expect(markup).toContain('name="modal"');
});
