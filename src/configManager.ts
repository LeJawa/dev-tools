import fs from "node:fs";
import vscode from "vscode";
import path from "path";

type ConfigObj = {
    dependents: string[];
    dependencies: string[];
    filesToCopy: string[];
};

export const rootPath: string =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined!;

const toolConfig = vscode.workspace.getConfiguration("dev-tools");
const relativeConfigFile = toolConfig.get<string>("configFilePath");

export const correctToolConfig = () =>
    rootPath !== undefined &&
    (relativeConfigFile !== undefined || relativeConfigFile !== "");

export const getConfigObj = () => {
    if (!rootPath || !relativeConfigFile) {
        return;
    }

    let absoluteConfigFile = path.join(rootPath, relativeConfigFile);

    if (!fs.existsSync(absoluteConfigFile)) {
        // Maybe in a worktree and config is in main repo
        // Test the theory

        const gitFilePath = path.join(rootPath, ".git");
        if (!fs.statSync(gitFilePath).isFile()) {
            // Wrong theory, cannot find file
            vscode.window.showErrorMessage(
                "Cannot find config file (" + absoluteConfigFile + ")"
            );
            return;
        }

        const content = fs.readFileSync(gitFilePath, "utf-8");

        const mainRepo = content
            .match(/gitdir: (.*).git\/worktrees\/.*/)
            ?.at(1);

        if (!mainRepo) {
            vscode.window.showErrorMessage("Cannot find main repo");
            return;
        }

        absoluteConfigFile = path.join(mainRepo, relativeConfigFile);
        if (!fs.existsSync(absoluteConfigFile)) {
            // Exit cann't find it
            vscode.window.showErrorMessage(
                "Cannot find config file (" + absoluteConfigFile + ")"
            );
            return;
        }
    }

    const config: ConfigObj = JSON.parse(
        fs.readFileSync(absoluteConfigFile, "utf-8")
    );

    return config;
};
