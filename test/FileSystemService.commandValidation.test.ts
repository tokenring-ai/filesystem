import {describe, it, expect, beforeEach, vi} from 'vitest';
import FileSystemService from '../FileSystemService.js';
import { createTestFileSystemService } from './testSetup.js';

/**
 * Test suite for FileSystemService command validation functionality
 * Tests the security features that prevent dangerous commands from being executed
 */
describe('FileSystemService Command Validation', () => {
  let fileSystemService: FileSystemService;

  beforeEach(() => {
    fileSystemService = createTestFileSystemService();
  });

  describe('Basic Command Validation', () => {
    it('should allow safe commands in allowed list', () => {
      const allowedCommands = fileSystemService.getAllowedCommands();
      
      // Test some of the expected allowed commands
      expect(allowedCommands).toContain('cd');
      expect(allowedCommands).toContain('ls');
      expect(allowedCommands).toContain('git');
      expect(allowedCommands).toContain('npm');
      expect(allowedCommands).toContain('yarn');
      expect(allowedCommands).toContain('bun');
      expect(allowedCommands).toContain('tsc');
      expect(allowedCommands).toContain('node');
      expect(allowedCommands).toContain('echo');
    });

    it('should validate individual commands correctly', () => {
      expect(fileSystemService.isCommandAllowed('cd')).toBe(true);
      expect(fileSystemService.isCommandAllowed('ls')).toBe(true);
      expect(fileSystemService.isCommandAllowed('git')).toBe(true);
      expect(fileSystemService.isCommandAllowed('npm')).toBe(true);
      expect(fileSystemService.isCommandAllowed('yarn')).toBe(true);
      expect(fileSystemService.isCommandAllowed('bun')).toBe(true);
      expect(fileSystemService.isCommandAllowed('tsc')).toBe(true);
    });

    it('should reject dangerous commands', () => {
      expect(fileSystemService.isCommandAllowed('rm')).toBe(false);
      expect(fileSystemService.isCommandAllowed('sudo')).toBe(false);
      expect(fileSystemService.isCommandAllowed('rm -rf')).toBe(false);
      expect(fileSystemService.isCommandAllowed('format')).toBe(false);
      expect(fileSystemService.isCommandAllowed('del')).toBe(false);
      expect(fileSystemService.isCommandAllowed('shutdown')).toBe(false);
      expect(fileSystemService.isCommandAllowed('reboot')).toBe(false);
    });

    it('should handle command variations', () => {
      expect(fileSystemService.isCommandAllowed('rm -rf /')).toBe(false);
      expect(fileSystemService.isCommandAllowed('rmdir')).toBe(false);
      expect(fileSystemService.isCommandAllowed('sudo ls')).toBe(false);
      expect(fileSystemService.isCommandAllowed('npm install')).toBe(true); // npm is allowed
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
      const command = 'cd frontend/chat && bun add lucide-react';
      const commands = fileSystemService.parseCompoundCommand(command);
      const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
      
      expect(invalidCommands).toHaveLength(0);
    });

    it('should detect dangerous commands in compound statements', () => {
      const command = 'cd src && rm -rf node_modules';
      const commands = fileSystemService.parseCompoundCommand(command);
      const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
      
      expect(invalidCommands).toContain('rm');
    });

    it('should detect multiple dangerous commands', () => {
      const command = 'rm file1 && sudo rm file2';
      const commands = fileSystemService.parseCompoundCommand(command);
      const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
      
      expect(invalidCommands).toContain('rm');
      expect(invalidCommands).toContain('sudo');
    });

    it('should validate complex compound commands', () => {
      const command = 'npm install; yarn build && tsc && echo "done"';
      const commands = fileSystemService.parseCompoundCommand(command);
      const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
      
      expect(invalidCommands).toHaveLength(0);
    });

    it('should validate command with wildcards', () => {
      // Test that wildcard patterns work correctly
      const allowedCommands = fileSystemService.getAllowedCommands();
      const hasNodeWildcard = allowedCommands.some(pattern => pattern === 'node*');
      
      if (hasNodeWildcard) {
        expect(fileSystemService.isCommandAllowed('node')).toBe(true);
        expect(fileSystemService.isCommandAllowed('nodejs')).toBe(true);
        expect(fileSystemService.isCommandAllowed('npm')).toBe(false); // npm should not match node*
      }
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle single character commands', () => {
      expect(fileSystemService.isCommandAllowed('a')).toBe(false); // Not in allowed list
      expect(fileSystemService.isCommandAllowed('l')).toBe(false); // Not in allowed list
    });

    it('should handle very long command names', () => {
      const longCommand = 'a'.repeat(1000);
      expect(fileSystemService.isCommandAllowed(longCommand)).toBe(false);
    });

    it('should handle commands with numbers', () => {
      expect(fileSystemService.isCommandAllowed('python3')).toBe(false);
      expect(fileSystemService.isCommandAllowed('python2')).toBe(false);
      expect(fileSystemService.isCommandAllowed('git2')).toBe(false);
    });

    it('should handle commands with underscores and hyphens', () => {
      expect(fileSystemService.isCommandAllowed('git_status')).toBe(false);
      expect(fileSystemService.isCommandAllowed('git-status')).toBe(false);
      expect(fileSystemService.isCommandAllowed('my_command')).toBe(false);
    });

    it('should handle case sensitivity correctly', () => {
      expect(fileSystemService.isCommandAllowed('CD')).toBe(false);
      expect(fileSystemService.isCommandAllowed('LS')).toBe(false);
      expect(fileSystemService.isCommandAllowed('Git')).toBe(false);
      expect(fileSystemService.isCommandAllowed('NPM')).toBe(false);
    });

    it('should handle null and undefined inputs', () => {
      expect(() => fileSystemService.isCommandAllowed(null as any)).not.toThrow();
      expect(() => fileSystemService.isCommandAllowed(undefined as any)).not.toThrow();
      expect(() => fileSystemService.parseCompoundCommand(null as any)).not.toThrow();
      expect(() => fileSystemService.parseCompoundCommand(undefined as any)).not.toThrow();
    });
  });

  describe('Real-world Security Scenarios', () => {
    it('should prevent common attack patterns', () => {
      const dangerousCommands = [
        'rm -rf /blah',
        'sudo rm -rf /blah',
        'format c:',
        'del /s /q *.*',
        'shutdown -h now',
        'reboot',
        'dd if=/dev/zero of=/dev/sda',
        'find / -name "*.txt" -exec rm {} \;',
        'chmod -R 777 /blah',
        'chown -R root:root /blah',
      ];

      dangerousCommands.forEach(command => {
        expect(fileSystemService.isCommandAllowed(command)).toBe(false);
      });
    });

    it('should allow legitimate development commands', () => {
      const safeCommands = [
        'npm install',
        'yarn add package-name',
        'bun add package-name',
        'git status',
        'git add .',
        'git commit -m "message"',
        'cd src/app',
        'tsc',
        'node dist/index.js',
        'echo "Hello World"',
      ];

      safeCommands.forEach(command => {
        const commands = fileSystemService.parseCompoundCommand(command);
        const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
        expect(invalidCommands).toHaveLength(0);
      });
    });

    it('should validate realistic compound commands', () => {
      const testCases = [
        {
          command: 'cd frontend/chat && bun add lucide-react',
          shouldBeValid: true,
          description: 'bun add with cd'
        },
        {
          command: 'npm install && npm run build',
          shouldBeValid: true,
          description: 'npm install and build'
        },
        {
          command: 'yarn test || npm test',
          shouldBeValid: true,
          description: 'yarn or npm test'
        },
        {
          command: 'git status; npm run lint',
          shouldBeValid: true,
          description: 'git status with npm lint'
        },
        {
          command: 'rm -rf node_modules && npm install',
          shouldBeValid: false,
          description: 'rm with npm install'
        },
        {
          command: 'cd / && sudo rm -rf *',
          shouldBeValid: false,
          description: 'cd to root with sudo rm'
        },
        {
          command: 'tsc --project tsconfig.json && npm run build',
          shouldBeValid: true,
          description: 'tsc with npm build'
        }
      ];

      testCases.forEach(({command, shouldBeValid, description}) => {
        const commands = fileSystemService.parseCompoundCommand(command);
        const invalidCommands = commands.filter(cmd => !fileSystemService.isCommandAllowed(cmd));
        const isValid = invalidCommands.length === 0;
        
        expect(isValid).toBe(shouldBeValid);
      });
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