import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempProject } from "../../test-utils/project/temp-project.js";
import { type SpawnFunction, withProcess } from "../helpers/spawn-cli-v2.js";

import type { TempProject } from "../../test-utils/project/temp-project.js";

describe("server add command - non-interactive behavior", () => {
  let tempProject: TempProject;

  beforeEach(async () => {
    tempProject = await createTempProject({
      config: {
        version: 1,
        mcpServers: {},
      },
      format: "yaml",
    });
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  it(
    "should fail with clear error when no file path provided in non-interactive mode",
    withProcess(async (spawn: SpawnFunction) => {
      const result = await spawn(["server", "add"], {
        cwd: tempProject.path,
        env: { ...process.env, MCPADRE_NON_INTERACTIVE: "1" },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/non.interactive.*requires.*file.*path/i);
    })
  );

  it(
    "should work with file path in non-interactive mode",
    withProcess(async (spawn: SpawnFunction) => {
      // Create a test ServerSpec file
      const serverSpecContent = {
        version: 1,
        mcpServers: {
          "test-server": {
            node: {
              package: "@test/example-server",
              version: "1.0.0",
            },
          },
        },
      };

      await tempProject.writeFile(
        "servers.json",
        JSON.stringify(serverSpecContent, null, 2)
      );

      const result = await spawn(
        ["server", "add", "servers.json", "--all", "--yes"],
        {
          cwd: tempProject.path,
          env: { ...process.env, MCPADRE_NON_INTERACTIVE: "1" },
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/successfully added.*server/i);
    })
  );
});
