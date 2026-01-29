import fs from "fs/promises";
import path from "path";
import { Log } from "../util/log";

const log = Log.create({ service: "project.binding" });

export interface ProjectConfig {
  id: string;
  name: string;
}

/**
 * Bind a directory to a project by creating .tanuki/project.json
 * Also updates .gitignore to exclude .tanuki directory
 */
export async function bindProject(
  targetPath: string,
  projectId: string,
  projectName?: string
): Promise<string> {
  const resolved = path.resolve(targetPath);
  const tanukiDir = path.join(resolved, ".tanuki");
  const projectFile = path.join(tanukiDir, "project.json");
  
  // Create .tanuki directory
  await fs.mkdir(tanukiDir, { recursive: true });
  
  // Write project config
  const config: ProjectConfig = {
    id: projectId,
    name: projectName || path.basename(resolved),
  };
  
  await fs.writeFile(projectFile, JSON.stringify(config, null, 2), "utf-8");
  
  // Update .gitignore
  const gitignorePath = path.join(resolved, ".gitignore");
  try {
    let gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(".tanuki")) {
      gitignoreContent += "\n.tanuki\n";
      await fs.writeFile(gitignorePath, gitignoreContent, "utf-8");
    }
  } catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, ".tanuki\n", "utf-8");
  }
  
  log.info("Project bound", { path: resolved, projectId });
  return projectFile;
}
