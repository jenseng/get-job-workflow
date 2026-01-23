import * as fs from "fs/promises";
import * as path from "path";
import find from "find-process";
import { globby } from "globby";

const processName = "Runner.Worker";
try {
  const results = await find.default("name", processName);
  if (results.length !== 1) {
    console.warn(results);
    throw new Error(`Expected exactly one Runner.worker process, but found ${results.length}`);
  }

  const workerCmd = results[0]!.cmd;
  const index = workerCmd.indexOf(path.join("bin", processName));
  if (index === -1) {
    throw new Error(
      `Unable to extract path from ${processName} command string, this might be a bug (${workerCmd})`
    );
  }

  const runnerDir = workerCmd.slice(0, index).replace(/^"/, ""); // on windows the bin is quoted
  const workerLogFiles = (
    await globby("Worker_*.log", {
      cwd: path.join(runnerDir, "_diag"),
      absolute: true,
    })
  )
    .sort()
    .reverse();

  if (workerLogFiles.length === 0) {
    throw new Error(`Unable to find ${processName} log file(s), this might be a bug`);
  }

  for (const file of workerLogFiles) {
    const content = await fs.readFile(file, "utf8");
    if (process.env["INPUT_OUTPUT-WORKER-LOG"] === "true") {
      process.stdout.write("Worker log file: " + file + "\n");
      process.stdout.write(content + "\n");
    }
    let jobMessage = content.match(/INFO Worker] Job message:\s+(.*?\r?\n\}\r?\n)/s)?.[1];
    if (jobMessage) {
      // deal with some bugs around masking secrets, which can result in invalid JSON
      // e.g. `"AccessToken": ***`
      jobMessage = jobMessage.replace(/: \*\*\*(,?$)/gm, ': "***"$1');
      // secret masking can inadvertently change a subsequent `\"` to `"`
      jobMessage = jobMessage.replace(/\\"\*\*\*"([^,])/g, '\\"***\\"$1');
      const parsed = JSON.parse(jobMessage);

      const githubContext = parsed?.contextData?.["github"]?.d ?? [];
      const topLevelWorkflowSha = githubContext.find(({ k }: any) => k === "workflow_sha")?.v ?? "";
      const topLevelWorkflowFullRef =
        githubContext.find(({ k }: any) => k === "workflow_ref")?.v ?? "";
      if (!topLevelWorkflowSha || !topLevelWorkflowFullRef) {
        throw new Error(
          `Unable to detect github.workflow_sha or github.workflow_ref, this might be a bug`
        );
      }
      const [topLevelWorkflowRepoAndPath, topLevelWorkflowRef] = topLevelWorkflowFullRef.split("@");

      // system.workflow... variables are only set if this is a nested workflow
      const workflowSha =
        parsed?.variables?.["system.workflowFileSha"]?.value ?? topLevelWorkflowSha;
      const workflowRef =
        parsed?.variables?.["system.workflowFileRef"]?.value ?? topLevelWorkflowRef;
      let workflowPath: string;
      let workflowRepository: string;

      const fullPath =
        parsed?.variables?.["system.workflowFileFullPath"]?.value ?? topLevelWorkflowRepoAndPath;
      const pathParts = fullPath.split("/");
      if (pathParts[0] === ".github") {
        workflowPath = fullPath;
        workflowRepository = process.env.GITHUB_REPOSITORY!;
      } else {
        workflowPath = pathParts.slice(2).join("/");
        workflowRepository = pathParts.slice(0, 2).join("/");
      }

      await fs.appendFile(
        process.env.GITHUB_OUTPUT!,
        [
          `sha=${workflowSha}`,
          `ref=${workflowRef}`,
          `path=${workflowPath}`,
          `repository=${workflowRepository}`,
        ].join("\n")
      );
      process.exit(0);
    }
  }
  throw new Error(`Unable to find job message in ${processName} log file(s), this might be a bug`);
} catch (e) {
  console.error(`::error::${e}`);
  process.exit(1);
}
