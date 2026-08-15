import { act } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

describe("web app entry point (main.tsx)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the router into #app and renders the home route", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    // Importing the entry point executes the mount: createRouter + createRoot().render().
    await act(async () => {
      await import("../main");
    });

    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("API Status")).toBeTruthy();
  });
});
