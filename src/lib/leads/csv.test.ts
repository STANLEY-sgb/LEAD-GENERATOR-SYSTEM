import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, commas, escaped quotes and CRLF", () => {
    expect(parseCsv('name,notes\r\n"Doe, Jo","said ""hi"""\r\nAnn,ok\n')).toEqual([["name", "notes"], ["Doe, Jo", 'said "hi"'], ["Ann", "ok"]]);
  });
  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
