import { renderRouter } from "expo-router/testing-library";

import Layout, { unstable_settings } from "../app/_layout";
import DrawerHome from "../app/(drawer)/index";
import DrawerLayout from "../app/(drawer)/_layout";
import Modal from "../app/modal";
import TabLayout from "../app/(drawer)/(tabs)/_layout";
import TabOne from "../app/(drawer)/(tabs)/index";
import TabTwo from "../app/(drawer)/(tabs)/two";

describe("native app entry point (app/_layout.tsx)", () => {
  it("exports a valid root layout entry", () => {
    expect(typeof Layout).toBe("function");
    expect(unstable_settings.initialRouteName).toBe("(drawer)");
  });

  it("renders the root layout and resolves the home route", async () => {
    // Mirror the real file tree so every route the root layout declares
    // (the "(drawer)" group, "modal") exists in the mock context.
    const result = renderRouter(
      {
        _layout: Layout,
        "(drawer)/_layout": DrawerLayout,
        "(drawer)/index": DrawerHome,
        "(drawer)/(tabs)/_layout": TabLayout,
        "(drawer)/(tabs)/index": TabOne,
        "(drawer)/(tabs)/two": TabTwo,
        modal: Modal,
      },
      { initialUrl: "/" },
    );
    const rendered = await result;

    expect(result.getPathname()).toBe("/");
    expect(await rendered.findByText(/Better T Stack|Tab One/)).toBeOnTheScreen();
  });
});
