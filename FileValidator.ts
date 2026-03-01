import type Agent from "@tokenring-ai/agent/Agent";

export type ValidationResult = {
  valid: boolean;
  result?: string;
}

/**
 * FileSystemProvider is an interface that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default interface FileValidator {
  validateFile(path: string, agent: Agent): Promise<ValidationResult>;
}
