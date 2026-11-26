import { describe, expect, it } from "vitest";
import { filePathsIn } from "./fileUris";

describe("filePathsIn", () => {
  it("reads a uri-list, skipping comments", () => {
    expect(
      filePathsIn(
        "# copied\nfile:///home/me/a%20b.png\r\nfile:///tmp/x.log",
        "",
      ),
    ).toEqual(["/home/me/a b.png", "/tmp/x.log"]);
  });

  it("reads GNOME's copied-files text", () => {
    expect(filePathsIn("", "copy\nfile:///home/me/notes.md")).toEqual([
      "/home/me/notes.md",
    ]);
  });

  it("leaves ordinary text alone", () => {
    expect(filePathsIn("", "see file:///tmp/x for details")).toEqual([]);
    expect(filePathsIn("", "copy")).toEqual([]);
    expect(filePathsIn("", "")).toEqual([]);
  });

  it("drops the leading slash of a Windows drive path", () => {
    expect(filePathsIn("file:///C:/Users/me/a.txt", "")).toEqual([
      "C:/Users/me/a.txt",
    ]);
  });
});
