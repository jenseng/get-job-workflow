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
      jobMessage = jobMessage.replace(/: \*\*\*(,?$)/g, ': "***"$1');
      jobMessage = jobMessage.replace(/\\"\*\*\*"([^,])/g, '\\"***\\"$1');
      const parsed = JSON.parse(jobMessage);
      await fs.appendFile(process.env.GITHUB_OUTPUT!, `sha=${parsed?.variables?.["system.workflowFileSha"].value ?? ""}\n`);
      await fs.appendFile(process.env.GITHUB_OUTPUT!, `ref=${parsed?.variables?.["system.workflowFileRef"].value ?? ""}\n`);
      const fullPath = parsed?.variables?.["system.workflowFileFullPath"].value ?? "";
      const pathParts = fullPath.split("/");
      let path: string;
      let repository: string;
      if (pathParts[0] === ".github") {
        path = fullPath;
        repository = process.env.GITHUB_REPOSITORY!;
      } else {
        path = pathParts.slice(2).join("/");
        repository = pathParts.slice(0, 2).join("/");
      }
      await fs.appendFile(process.env.GITHUB_OUTPUT!, `path=${path}\n`);
      await fs.appendFile(process.env.GITHUB_OUTPUT!, `repository=${repository}\n`);
      process.exit(0);
    }
  }
  throw new Error(`Unable to find job message in ${processName} log file(s), this might be a bug`);
} catch (e) {
  console.error(`::error::${e}`);
  process.exit(1);
}
