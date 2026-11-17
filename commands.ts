import fileAdd from "./commands/file/add.ts";
import fileClear from "./commands/file/clear.ts";
import fileDefault from "./commands/file/default.ts";
import fileList from "./commands/file/list.ts";
import fileRemove from "./commands/file/remove.ts";
import fileSelect from "./commands/file/select.ts";
import pathAdd from "./commands/filesystem/path/add.ts";
import pathList from "./commands/filesystem/path/list.ts";
import pathRemove from "./commands/filesystem/path/remove.ts";

export default [fileSelect, fileAdd, fileRemove, fileList, fileClear, fileDefault, pathList, pathAdd, pathRemove];
