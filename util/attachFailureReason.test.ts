import { describe, expect, it } from "bun:test";
import attachFailureReason from "./attachFailureReason.ts";

const fsError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("attachFailureReason", () => {
  it("says a missing file is gone instead of showing the raw ENOENT error and its path", () => {
    const reason = attachFailureReason(fsError("ENOENT", "ENOENT: no such file or directory, open '/home/me/.tokenring/x'"));
    expect(reason).toBe("it no longer exists.");
  });

  it("names permission and folder problems", () => {
    expect(attachFailureReason(fsError("EACCES", "nope"))).toBe("permission denied.");
    expect(attachFailureReason(fsError("EISDIR", "nope"))).toBe("it is a folder.");
  });

  it("falls back to the error message without a stack", () => {
    const reason = attachFailureReason(new Error("disk on fire"));
    expect(reason).toContain("disk on fire");
    expect(reason).not.toContain("    at ");
  });
});
