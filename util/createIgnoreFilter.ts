/**
 * Create an ignore filter for files
 * @private
 */
import ignore from "ignore";
import FileSystemProvider from "../FileSystemProvider.ts";

export default async function createIgnoreFilter(fileSystem: FileSystemProvider): Promise<(p: string) => boolean> {
  // Create the base ignore filter
  const ig = ignore();
  ig.add(".git"); // always ignore .git dir at root
  ig.add("*.lock");
  ig.add("node_modules");
  ig.add(".*");

  const gitIgnorePath = ".gitignore";
  if (await fileSystem.exists(gitIgnorePath)) {
    const data = await fileSystem.readFile(gitIgnorePath);
    if (data) {
      const lines = data.toString('utf-8').split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  const aiIgnorePath = ".aiignore";
  if (await fileSystem.exists(aiIgnorePath)) {
    const data = await fileSystem.readFile(aiIgnorePath);
    if (data) {
      const lines = data.toString('utf-8').split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  return ig.ignores.bind(ig);
}