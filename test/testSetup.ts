import { describe, beforeEach, vi } from 'vitest';
import FileSystemService from '../FileSystemService.js';
import { z } from 'zod';
import { FileSystemConfigSchema } from '../index.ts';

// Test configuration for FileSystemService
const testConfig = {
  defaultProvider: 'test',
  providers: {
    test: {}
  },
  safeCommands: [
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which",
    "npm", "yarn", "bun", "tsc", "node"
  ],
  dangerousCommands: [
    "rm ",
    "sudo",
    "format",
    "del ",
    "shutdown",
    "reboot",
    "reset",
    "dd",
    "chmod",
    "chown"
  ]
};

// Create a test instance of FileSystemService
export function createTestFileSystemService() {
  return new FileSystemService(testConfig);
}

export { testConfig };