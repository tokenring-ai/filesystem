import {JsonRPCSchema} from "@tokenring-ai/web-host/jsonrpc/types";
import {z} from "zod";

export default {
  path: "/rpc/filesystem",
  methods: {
    readTextFile: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        path: z.string()
      }),
      result: z.object({
        content: z.string().nullable()
      })
    },
    exists: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        path: z.string()
      }),
      result: z.object({
        exists: z.boolean()
      })
    },
    stat: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        path: z.string()
      }),
      result: z.object({
        stats: z.string()
      })
    },
    glob: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        pattern: z.string()
      }),
      result: z.object({
        files: z.array(z.string())
      })
    },
    listDirectory: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        path: z.string(),
        showHidden: z.boolean().default(false),
        recursive: z.boolean().default(false)
      }),
      result: z.object({
        files: z.array(z.string())
      })
    },
    writeFile: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        path: z.string(),
        content: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    appendFile: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        path: z.string(),
        content: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    deleteFile: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        path: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    rename: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        oldPath: z.string(),
        newPath: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    createDirectory: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        path: z.string(),
        recursive: z.boolean().default(false)
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    copy: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        source: z.string(),
        destination: z.string(),
        overwrite: z.boolean().default(false)
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    addFileToChat: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        file: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    removeFileFromChat: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        file: z.string()
      }),
      result: z.object({
        success: z.boolean()
      })
    },
    getSelectedFiles: {
      type: "query",
      input: z.object({
        agentId: z.string()
      }),
      result: z.object({
        files: z.array(z.string())
      })
    }
  }
} satisfies JsonRPCSchema;
