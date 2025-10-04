import Agent from "@tokenring-ai/agent/Agent";
import {IterableItem, IterableProvider, IterableSpec} from "@tokenring-ai/iterables";
import path from "path";
import FileSystemService from "./FileSystemService.ts";

export default class GlobIterableProvider implements IterableProvider {
  type = "glob";
  description = "Iterate over files matching glob patterns";
  
  async* generate(spec: IterableSpec, agent: Agent): AsyncGenerator<IterableItem> {
    const fs = agent.requireServiceByType(FileSystemService);
    
    const files = await fs.glob(spec.pattern, {
      includeDirectories: spec.includeDirectories ?? false,
      absolute: spec.absolute ?? true
    });
    
    for (const file of files) {
      const stat = await fs.stat(file);
      const content = stat.isFile ? await fs.getFile(file) : null;
      
      yield {
        value: file,
        variables: {
          file,
          path: path.dirname(file),
          basename: path.basename(file),
          ext: path.extname(file),
          content,
          size: stat.size,
          modified: stat.modified
        }
      };
    }
  }
}
