import { describe, expect, it } from "vitest";
import { closeModalRoute, modalRoute } from "./route-modal.utils";

describe("route modal helpers", () => {
  it("builds named-outlet commands for slide-out modal routes", () => {
    expect(modalRoute("release", "event-123")).toEqual(["/", { outlets: { modal: ["release", "event-123"] } }]);
  });

  it("builds commands that close the modal outlet without changing the primary route", () => {
    expect(closeModalRoute()).toEqual([{ outlets: { modal: null } }]);
  });
});
