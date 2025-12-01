import {ContextHandler} from "@tokenring-ai/chat/types";
import searchFiles from "./contextHandlers/searchFiles.ts";
import selectedFiles from "./contextHandlers/selectedFiles.ts";

export default {
  'selected-files': selectedFiles,
  'search-files': searchFiles,
} as Record<string, ContextHandler>;
