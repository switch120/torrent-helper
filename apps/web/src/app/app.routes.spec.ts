import "@angular/compiler";
import { describe, expect, it } from "vitest";
import { routes } from "./app.routes";

describe("app routes", () => {
  it("keeps full-page routes and adds durable modal outlet routes", () => {
    const modalRoutes = routes.filter((route) => route.outlet === "modal").map((route) => route.path);

    expect(routes.some((route) => route.path === "release/:eventId" && !route.outlet)).toBe(true);
    expect(routes.some((route) => route.path === "downloads" && !route.outlet)).toBe(true);
    expect(routes.some((route) => route.path === "favorites" && !route.outlet)).toBe(true);
    expect(modalRoutes).toEqual([
      "release/:eventId",
      "downloads",
      "downloads/history",
      "favorites",
      "settings",
      "settings/providers",
      "settings/hidden-shows",
    ]);
  });
});
