import { Text } from "react-native";
import { renderRouter } from "expo-router/testing-library";

import Layout, { unstable_settings } from "../app/_layout";

describe("native app entry point (app/_layout.tsx)", () => {
  it("exports a valid root layout entry", () => {
    expect(typeof Layout).toBe("function");
    expect(unstable_settings.initialRouteName).toBe("(drawer)");
  });

  it("renders the root layout and resolves the home route", async () => {
    // renderRouter returns RNTL's (async) render result augmented with router
    // helpers on the promise itself; await it to reach the query API.
    const result = renderRouter(
      {
        _layout: Layout,
        index: () => <Text>Home Screen</Text>,
        modal: () => <Text>Modal Screen</Text>,
      },
      { initialUrl: "/" },
    );
    const rendered = await result;

    expect(result.getPathname()).toBe("/");
    expect(await rendered.findByText("Home Screen")).toBeOnTheScreen();
  });
});
