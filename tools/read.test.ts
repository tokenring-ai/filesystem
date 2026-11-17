import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemConfigSchema } from "../schema.ts";
import read from "./read.ts";

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tr-read-")));
const root = path.join(base, "root");
fs.mkdirSync(path.join(root, "a", "b", "c"), { recursive: true });
fs.writeFileSync(path.join(root, "a", "one.txt"), "one");
fs.writeFileSync(path.join(root, "a", "b", "two.txt"), "two");
fs.writeFileSync(path.join(root, "a", "b", "c", "three.txt"), "three");
fs.mkdirSync(path.join(base, "outside"));
fs.writeFileSync(path.join(base, "outside", "secret.txt"), "TOPSECRET");
fs.symlinkSync(path.join(base, "outside", "secret.txt"), path.join(root, "a", "link.txt"));
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

function setup(maxFileReadCount = 10) {
  const app = createTestingApp();
  const fileSystem = new FileSystemService(
    app,
    FileSystemConfigSchema.parse({ agentDefaults: { selectedFiles: [], settings: { maxFileReadCount } }, allowedPaths: [{ path: root, permission: "write" }] }),
  );
  app.addService(FileSystemService, fileSystem);
  return { agent: createTestingAgent(app), fileSystem };
}

describe("file_read on a directory", () => {
  it("reads each nested file once, and a link leaving the allowed folders fails alone", async () => {
    const { agent, fileSystem } = setup();
    let reads = 0;
    const realRead = fileSystem.readFile.bind(fileSystem);
    fileSystem.readFile = (async (...args: Parameters<typeof realRead>) => {
      reads++;
      return realRead(...args);
    }) as typeof fileSystem.readFile;

    const result = await read.execute({ files: [path.join(root, "a")] }, agent);
    const text = JSON.stringify(result);
    expect(text).toContain("three");
    expect(text).not.toContain("TOPSECRET");
    // one, two, three, and the link (refused): not once per ancestor directory.
    expect(reads).toBeLessThanOrEqual(4);
  });

  it("returns only the names past the limit, without reading the files", async () => {
    const { agent, fileSystem } = setup(1);
    let reads = 0;
    const realRead = fileSystem.readFile.bind(fileSystem);
    fileSystem.readFile = (async (...args: Parameters<typeof realRead>) => {
      reads++;
      return realRead(...args);
    }) as typeof fileSystem.readFile;

    const result = await read.execute({ files: [path.join(root, "a")] }, agent);
    expect(String(result.result)).toContain("more than 1 files");
    expect(reads).toBe(0);
  });
});
