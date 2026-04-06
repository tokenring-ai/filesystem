import fileSelect from './commands/file/select.ts';
import fileAdd from './commands/file/add.ts';
import fileRemove from './commands/file/remove.ts';
import fileList from './commands/file/list.ts';
import fileClear from './commands/file/clear.ts';
import fileDefault from './commands/file/default.ts';
import providerGet from './commands/filesystem/provider/get.ts';
import providerSet from './commands/filesystem/provider/set.ts';
import providerSelect from './commands/filesystem/provider/select.ts';
import providerReset from './commands/filesystem/provider/reset.ts';

export default [fileSelect, fileAdd, fileRemove, fileList, fileClear, fileDefault, providerGet, providerSet, providerSelect, providerReset];
