import {beforeEach, describe, expect, it} from 'vitest';
import FileSystemService from '../FileSystemService.js';
import createTestFileSystem from './createTestFilesystem.js';

/**
 * Test suite for FileSystemService command validation functionality
 * Tests the security features that prevent dangerous commands from being executed
 */
describe('FileSystemService Command Validation', () => {
  let fileSystemService: FileSystemService;

  beforeEach(() => {
    fileSystemService = createTestFileSystem();
  });

  describe('Basic Command Validation', () => {
    it('should validate individual commands correctly', () => {
      expect(fileSystemService.getCommandSafetyLevel('cd')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('ls')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('git')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('npm')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('yarn')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('bun')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('tsc')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('node')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('echo')).toBe('safe');
    });

    it('should reject dangerous commands', () => {
      expect(fileSystemService.getCommandSafetyLevel('rm')).toBe('unknown');
      expect(fileSystemService.getCommandSafetyLevel('sudo ')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('rm -rf')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('format ')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('del ')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('shutdown')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('reboot')).toBe('dangerous');
    });

    it('should handle command variations', () => {
      expect(fileSystemService.getCommandSafetyLevel('rm -rf /')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('rmdir ')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('sudo ls')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('npm install')).toBe('safe'); // npm is allowed
    });
  });

  describe('Compound Command Parsing', () => {
    it('should parse simple compound commands', () => {
      const commands = fileSystemService.parseCompoundCommand('cd frontend/chat && bun add lucide-react');
      expect(commands).toEqual(['cd', 'bun']);
    });

    it('should parse commands with multiple separators', () => {
      const commands = fileSystemService.parseCompoundCommand('npm install; yarn build && npm test');
      expect(commands).toEqual(['npm', 'yarn', 'npm']);
    });

    it('should handle pipe operator', () => {
      const commands = fileSystemService.parseCompoundCommand('ls -la | grep test');
      expect(commands).toEqual(['ls', 'grep']);
    });

    it('should handle OR operator', () => {
      const commands = fileSystemService.parseCompoundCommand('git status || echo "not in git repo"');
      expect(commands).toEqual(['git', 'echo']);
    });

    it('should handle output redirection', () => {
      const commands = fileSystemService.parseCompoundCommand('ls > files.txt');
      expect(commands).toEqual(['ls']);
    });

    it('should handle append redirection', () => {
      const commands = fileSystemService.parseCompoundCommand('echo "text" >> log.txt');
      expect(commands).toEqual(['echo']);
    });

    it('should handle complex compound commands', () => {
      const commands = fileSystemService.parseCompoundCommand(
        'cd src && npm run build && echo "done" || echo "failed"'
      );
      expect(commands).toEqual(['cd', 'npm', 'echo', 'echo']);
    });

    it('should handle commands with quotes and special characters', () => {
      const commands = fileSystemService.parseCompoundCommand('echo "hello world" && ls -la "path with spaces"');
      expect(commands).toEqual(['echo', 'ls']);
    });

    it('should handle empty commands', () => {
      expect(fileSystemService.parseCompoundCommand('')).toEqual([]);
      expect(fileSystemService.parseCompoundCommand('   ')).toEqual([]);
    });

    it('should handle commands with only separators', () => {
      expect(fileSystemService.parseCompoundCommand('&&')).toEqual([]);
      expect(fileSystemService.parseCompoundCommand('&& || ; |')).toEqual([]);
    });
  });

  describe('Compound Command Security Validation', () => {
    it('should validate compound command where all commands are allowed', () => {
      expect(fileSystemService.getCommandSafetyLevel('cd frontend/chat && bun add lucide-react')).toBe('safe');
    });
    it('should detect dangerous commands in compound statements', () => {
      expect(fileSystemService.getCommandSafetyLevel('cd src && rm -rf node_modules')).toBe('dangerous');
    });

    it('should detect multiple dangerous commands', () => {
      expect(fileSystemService.getCommandSafetyLevel('rm file1 && sudo rm file2')).toBe('dangerous');
    });

    it('should validate complex compound commands', () => {
      expect(fileSystemService.getCommandSafetyLevel('npm install; yarn build && tsc && echo "done"')).toBe('safe');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle single character commands', () => {
      expect(fileSystemService.getCommandSafetyLevel('a')).toBe('unknown');
    });

    it('should handle very long command names', () => {
      const longCommand = 'a'.repeat(1000) + 'rm';
      expect(fileSystemService.getCommandSafetyLevel(longCommand)).toBe('unknown');
    });

    it('should handle case sensitivity correctly', () => {
      expect(fileSystemService.getCommandSafetyLevel('RM -r')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('NPM')).toBe('safe');
    });
  });

  describe('Real-world Security Scenarios', () => {
    it('should prevent common attack patterns', () => {
      expect(fileSystemService.getCommandSafetyLevel('rm -rf /blah')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('sudo rm -rf /blah')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('format c:')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('del /s /q *.*')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('shutdown -h now')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('reboot')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('dd if=/dev/zero of=/dev/sda')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('find / -name "*.txt" -exec rm {} \;')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('chmod -R 777 /blah')).toBe('dangerous');
      expect(fileSystemService.getCommandSafetyLevel('chown -R root:root /blah')).toBe('dangerous');
    });

    it('should allow legitimate development commands', () => {

      expect(fileSystemService.getCommandSafetyLevel('npm install')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('yarn add package-name')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('bun add package-name')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('git status')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('git add .')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('git commit -m "message"')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('cd src/app')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('tsc')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('node dist/index.js')).toBe('safe');
      expect(fileSystemService.getCommandSafetyLevel('echo "Hello World"')).toBe('safe');
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle large compound commands efficiently', () => {
      const largeCommand = 'npm install && npm run build && npm run test && npm run lint';
      const commands = fileSystemService.parseCompoundCommand(largeCommand);
      
      expect(commands).toEqual(['npm', 'npm', 'npm', 'npm']);
      expect(commands.length).toBe(4);
    });

    it('should handle commands with many separators', () => {
      const complexCommand = 'cmd1 && cmd2 || cmd3; cmd4 | cmd5 >> file';
      const commands = fileSystemService.parseCompoundCommand(complexCommand);
      
      expect(commands).toEqual(['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5']);
    });

    it('should not have memory leaks for large inputs', () => {
      const largeCommand = 'cmd1 && cmd2 && cmd3 && cmd4 && cmd5'; // 20+ commands
      const commands = fileSystemService.parseCompoundCommand(largeCommand);
      
      expect(commands.length).toBe(5);
      expect(commands).toEqual(['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5']);
    });
  });
});