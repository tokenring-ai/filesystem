import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemConfigSchema } from "../schema.ts";
import grep from "./grep.ts";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tr-grep-")));
fs.mkdirSync(path.join(root, "src", "deep"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "a.ts"), "const one = 1;\nfunction findUser() {}\nconst two = 2;\nconst three = 3;\n");
fs.writeFileSync(path.join(root, "src", "deep", "b.ts"), "export const findUser = () => null;\n");
fs.writeFileSync(path.join(root, "src", "c.ts"), "nothing here\n");
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function setup() {
  const app = createTestingApp();
  app.addService(
    FileSystemService,
    new FileSystemService(app, FileSystemConfigSchema.parse({ agentDefaults: { selectedFiles: [] }, allowedPaths: [{ path: root, permission: "write" }] })),
  );
  return createTestingAgent(app);
}

describe("file_grep", () => {
  it("finds a regex match without hanging, in nested files too", async () => {
    const agent = setup();
    const result = await grep.execute(
      { filePaths: [path.join(root, "src", "**", "*.ts")], searchTerms: ["/find\\w+/"], includeHidden: false, gitignore: true, aiignore: true },
      agent,
    );
    const text = String(result.result);
    expect(text).toContain(path.join(root, "src", "a.ts"));
    expect(text).toContain(path.join(root, "src", "deep", "b.ts"));
    expect(text).not.toContain(path.join(root, "src", "c.ts"));
  }, 5000);

  it("survives a regex that can match the empty string", async () => {
    const agent = setup();
    const result = await grep.execute(
      { filePaths: [path.join(root, "src", "a.ts")], searchTerms: ["/x*/"], includeHidden: false, gitignore: true, aiignore: true },
      agent,
    );
    expect(result.failed).toBeUndefined();
  }, 5000);

  it("reports an invalid regex instead of throwing", async () => {
    const agent = setup();
    const result = await grep.execute(
      { filePaths: [path.join(root, "src", "**", "*.ts")], searchTerms: ["/(unclosed/"], includeHidden: false, gitignore: true, aiignore: true },
      agent,
    );
    expect(result.failed).toBe(true);
    expect(String(result.result)).toContain("not a valid regular expression");
  });
});
