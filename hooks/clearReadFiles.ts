import {Agent} from "@tokenring-ai/agent";
import {AfterChatClear, AfterChatCompaction} from "@tokenring-ai/chat/lifecycle";
import type {HookSubscription} from "@tokenring-ai/lifecycle/types";
import {HookCallback} from "@tokenring-ai/lifecycle/util/hooks";
import {FileSystemState} from "../state/fileSystemState";

const name = "clearReadFiles";
const displayName = "Filesystem/Clear Read Files";
const description = "Automatically clears the read files state when the chat context is compacted or cleared";

function clearReadFiles(_data: any, agent: Agent) {
  agent.mutateState(FileSystemState, state => {
    state.readFiles = new Set();
    state.dirty = false;
  });
}

const callbacks = [
  new HookCallback(AfterChatCompaction, clearReadFiles),
  new HookCallback(AfterChatClear, clearReadFiles),
];

export default {name, displayName, description, callbacks} satisfies HookSubscription;