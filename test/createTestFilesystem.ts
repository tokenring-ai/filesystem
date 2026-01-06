import {z} from "zod";
import FileSystemService from '../FileSystemService.js';

import {FileSystemConfigSchema} from "../schema";

// Test configuration for FileSystemService
const testConfig = {
  agentDefaults: {
    provider: 'test',
  },
  providers: {
    test: {
      type: 'test',
    }
  }
} satisfies z.input< typeof FileSystemConfigSchema>;

// Create a test instance of FileSystemService
export default function createTestFileSystem() {
  return new FileSystemService(FileSystemConfigSchema.parse(testConfig));
}