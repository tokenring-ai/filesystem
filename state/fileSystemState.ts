import type {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";

export class FileSystemState implements AgentStateSlice {
  name = "FileSystemState";
  readonly initialSelectedFiles: Set<string>;
  selectedFiles: Set<string>;

  constructor({selectedFiles}: { selectedFiles: Set<string> }) {
    this.initialSelectedFiles = new Set(selectedFiles);
    this.selectedFiles = new Set(selectedFiles);
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("chat")) {
      this.selectedFiles = new Set(this.initialSelectedFiles);
    }
  }

  serialize(): object {
    return {
      selectedFiles: Array.from(this.selectedFiles),
    };
  }

  deserialize(data: any): void {
    this.selectedFiles = new Set(data.selectedFiles);
  }

  show(): string[] {
    return [
      `Selected Files: ${this.selectedFiles.size}`,
      ...Array.from(this.selectedFiles).map(f => `  - ${f}`)
    ];
  }
}
