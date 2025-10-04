import Agent from "@tokenring-ai/agent/Agent";
import {IterableItem, IterableProvider, IterableSpec} from "@tokenring-ai/iterables";
import path from "path";
import FileSystemService from "./FileSystemService.ts";

export default class FilesIterableProvider implements IterableProvider {
  type = "files";
  description = "Iterate over an explicit list of files";
  
  getArgsConfig() {
    return {
      options: {
        files: {type: 'string' as const, multiple: true}
      }
    };
  }
  
  async* generate(spec: IterableSpec, agent: Agent): AsyncGenerator<IterableItem> {
    const fs = agent.requireServiceByType(FileSystemService);
    const files = Array.isArray(spec.files) ? spec.files : [spec.files];
    
    for (const file of files) {
      const exists = await fs.exists(file);
      if (!exists) continue;
      
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
