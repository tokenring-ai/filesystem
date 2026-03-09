import {HookSubscription} from "@tokenring-ai/agent/types";
import {HookCallback} from "@tokenring-ai/agent/util/hooks";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import {AfterTestsPassed} from "@tokenring-ai/testing/hooks";
import TestingService from "@tokenring-ai/testing/TestingService";
import {execute as commit} from "../tools/commit.ts";

const name = "autoCommit";
const displayName = "Git/Auto Commit";
const description =
  "Automatically commit changes to the source directory to git";

const callbacks = [
  new HookCallback(AfterTestsPassed, async (_data, agent) => {
    const testingService = agent.requireServiceByType(TestingService);
    const filesystem = agent.requireServiceByType(FileSystemService);
    if (filesystem.isDirty(agent)) {
      if (!testingService.allTestsPassed(agent)) {
        agent.errorMessage(
          "Not committing changes, due to tests not passing",
        );
        return;
      }
      await commit({message: ""}, agent);
    }
  })
];

export default {name, displayName, description, callbacks} satisfies HookSubscription;