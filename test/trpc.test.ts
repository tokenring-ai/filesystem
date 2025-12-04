import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filesystemRouter } from '../trpc/filesystem.js';
import FileSystemService from '../FileSystemService.js';

describe('filesystemRouter', () => {
    let mockFileSystemService;
    let caller;

    beforeEach(() => {
        mockFileSystemService = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            appendFile: vi.fn(),
            deleteFile: vi.fn(),
            rename: vi.fn(),
            exists: vi.fn(),
            stat: vi.fn(),
            createDirectory: vi.fn(),
            copy: vi.fn(),
            glob: vi.fn(),
            getDirectoryTree: vi.fn(),
        };

        const ctx = {
            requireService: (service) => {
                if (service === FileSystemService) {
                    return mockFileSystemService;
                }
                throw new Error('Service not found');
            },
        };

        caller = filesystemRouter.createCaller(ctx);
    });

    it('should read file', async () => {
        mockFileSystemService.readFile.mockResolvedValue('content');
        const result = await caller.filesystem.readFile({ path: 'test.txt' });
        expect(result).toEqual({ content: 'content' });
        expect(mockFileSystemService.readFile).toHaveBeenCalledWith('test.txt', 'utf8');
    });

    it('should write file', async () => {
        mockFileSystemService.writeFile.mockResolvedValue(true);
        const result = await caller.filesystem.writeFile({ path: 'test.txt', content: 'content' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith('test.txt', 'content');
    });

    it('should append file', async () => {
        mockFileSystemService.appendFile.mockResolvedValue(true);
        const result = await caller.filesystem.appendFile({ path: 'test.txt', content: 'content' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.appendFile).toHaveBeenCalledWith('test.txt', 'content');
    });

    it('should delete file', async () => {
        mockFileSystemService.deleteFile.mockResolvedValue(true);
        const result = await caller.filesystem.deleteFile({ path: 'test.txt' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.deleteFile).toHaveBeenCalledWith('test.txt');
    });

    it('should rename file', async () => {
        mockFileSystemService.rename.mockResolvedValue(true);
        const result = await caller.filesystem.rename({ oldPath: 'old.txt', newPath: 'new.txt' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.rename).toHaveBeenCalledWith('old.txt', 'new.txt');
    });

    it('should check if file exists', async () => {
        mockFileSystemService.exists.mockResolvedValue(true);
        const result = await caller.filesystem.exists({ path: 'test.txt' });
        expect(result).toEqual({ exists: true });
        expect(mockFileSystemService.exists).toHaveBeenCalledWith('test.txt');
    });

    it('should get file stats', async () => {
        const stats = { size: 100 };
        mockFileSystemService.stat.mockResolvedValue(stats);
        const result = await caller.filesystem.stat({ path: 'test.txt' });
        expect(result).toEqual({ stats });
        expect(mockFileSystemService.stat).toHaveBeenCalledWith('test.txt');
    });

    it('should create directory', async () => {
        mockFileSystemService.createDirectory.mockResolvedValue(true);
        const result = await caller.filesystem.createDirectory({ path: 'test' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.createDirectory).toHaveBeenCalledWith('test', { recursive: false });
    });

    it('should copy file', async () => {
        mockFileSystemService.copy.mockResolvedValue(true);
        const result = await caller.filesystem.copy({ source: 'src', destination: 'dest' });
        expect(result).toEqual({ success: true });
        expect(mockFileSystemService.copy).toHaveBeenCalledWith('src', 'dest', { overwrite: false });
    });

    it('should glob files', async () => {
        mockFileSystemService.glob.mockResolvedValue(['file1', 'file2']);
        const result = await caller.filesystem.glob({ pattern: '*.txt' });
        expect(result).toEqual({ files: ['file1', 'file2'] });
        expect(mockFileSystemService.glob).toHaveBeenCalledWith('*.txt');
    });

    it('should list directory', async () => {
        async function* gen() {
            yield 'file1';
            yield 'file2';
        }
        mockFileSystemService.getDirectoryTree.mockReturnValue(gen());
        const result = await caller.filesystem.listDirectory({ path: 'test' });
        expect(result).toEqual({ files: ['file1', 'file2'] });
        expect(mockFileSystemService.getDirectoryTree).toHaveBeenCalledWith('test', { recursive: false });
    });
});
