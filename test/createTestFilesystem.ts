import FileSystemService from '../FileSystemService.js';
import {FileSystemConfigSchema} from "../index";

// Test configuration for FileSystemService
const testConfig = {
  defaultProvider: 'test',
  providers: {
    test: {
      type: 'test',
    }
  }
};

// Create a test instance of FileSystemService
export default function createTestFileSystem() {
  return new FileSystemService(FileSystemConfigSchema.parse(testConfig));
}