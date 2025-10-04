import Agent from "@tokenring-ai/agent/Agent";
import {IterableItem, IterableProvider, IterableSpec} from "@tokenring-ai/iterables";
import FileSystemService from "./FileSystemService.ts";

export default class LinesIterableProvider implements IterableProvider {
  type = "lines";
  description = "Iterate over lines in a text file";
  
  getArgsConfig() {
    return {
      options: {
        file: {type: 'string' as const},
        skipEmpty: {type: 'boolean' as const},
        trim: {type: 'boolean' as const}
      }
    };
  }
  
  async* generate(spec: IterableSpec, agent: Agent): AsyncGenerator<IterableItem> {
    const fs = agent.requireServiceByType(FileSystemService);
    const content = await fs.getFile(spec.file);
    
    if (!content) return;
    
    const lines = content.split(/\r?\n/);
    const skipEmpty = spec.skipEmpty ?? true;
    const trim = spec.trim ?? true;
    
    let lineNumber = 0;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      if (trim) {
        line = line.trim();
      }
      
      if (skipEmpty && !line) {
        continue;
      }
      
      lineNumber++;
      
      yield {
        value: line,
        variables: {
          line,
          lineNumber,
          totalLines: lines.length,
          file: spec.file
        }
      };
    }
  }
}
