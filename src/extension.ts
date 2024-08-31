// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { globSync } from "glob";
import { WorktreeNode, WorktreeView } from "./worktreeView";
import { runGitCommand } from "./commandHelper";
import { MyDecorationProvider } from "./fileDecorator";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log(
        'Congratulations, your extension "copy-extension" is now active!'
    );

    const rootPath =
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand(
        "copy-extension.copy",
        async () => {
            const config = vscode.workspace.getConfiguration("copy-extension");
            const relativeConfigFile = config.get<string>("configFilePath");

            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders && relativeConfigFile) {
                const rootPath = workspaceFolders[0].uri.fsPath;
                let absoluteConfigFile = path.join(
                    rootPath,
                    relativeConfigFile
                );

                if (!fs.existsSync(absoluteConfigFile)) {
                    // Maybe in a worktree and config is in main repo
                    // Test the theory

                    const gitFilePath = path.join(rootPath, ".git");
                    if (!fs.statSync(gitFilePath).isFile()) {
                        // Wrong theory, cannot find file
                        vscode.window.showErrorMessage(
                            "Cannot find config file (" +
                                absoluteConfigFile +
                                ")"
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

                    absoluteConfigFile = path.join(
                        mainRepo,
                        relativeConfigFile
                    );
                    if (!fs.existsSync(absoluteConfigFile)) {
                        // Exit cann't find it
                        vscode.window.showErrorMessage(
                            "Cannot find config file (" +
                                absoluteConfigFile +
                                ")"
                        );
                        return;
                    }
                }

                const config: { targets: string[]; filesToCopy: string[] } =
                    JSON.parse(fs.readFileSync(absoluteConfigFile, "utf-8"));

                let dirTargets: string[] = [];

                config.targets.forEach((dir) => {
                    // FIXME: Absolute path is not working
                    const dirPath = path.isAbsolute(dir)
                        ? dir
                        : path.join(rootPath, dir);
                    const subDirs = fs
                        .readdirSync(dirPath, { withFileTypes: true })
                        .filter((dirent) => dirent.isDirectory())
                        .map((dirent) => dirent.name);

                    subDirs.forEach((subDir) =>
                        dirTargets.push(path.join(dirPath, subDir))
                    );
                });

                const optionText = ["All"].concat(
                    dirTargets.map((dir) =>
                        path.relative(path.join(dir, "../.."), dir)
                    )
                );

                const options = await vscode.window.showQuickPick(optionText, {
                    placeHolder: "Select an option",
                });

                if (options === undefined) {
                    return;
                }

                const packageConfig = JSON.parse(
                    fs.readFileSync(
                        path.join(rootPath, "package.json"),
                        "utf-8"
                    )
                );

                if (!packageConfig.name || !packageConfig.files) {
                    // Not a correctly defined package
                    return;
                }

                const prefixToFiles = path.join(
                    "node_modules",
                    ...packageConfig.name.split("/")
                );

                const filesToCopy: string[] = [];
                config.filesToCopy.forEach((file) => {
                    const sourceFile = path.join(rootPath, file);

                    // Glob only works with forward slashes
                    const foundFiles = globSync(
                        sourceFile.replaceAll("\\", "/"),
                        { nodir: true }
                    );

                    foundFiles.forEach((foundFile) => {
                        filesToCopy.push(path.relative(rootPath, foundFile));
                    });
                });

                if (options !== "All") {
                    dirTargets = [
                        path.resolve(path.join(rootPath, "../..", options)),
                    ];
                }

                dirTargets.forEach((targetPath) => {
                    console.log(targetPath);
                    filesToCopy.forEach((file) => {
                        const sourceFile = path.join(rootPath, file);

                        let targetFile = path.join(
                            targetPath,
                            prefixToFiles,
                            file
                        );

                        console.log(
                            `- ${path.relative(
                                rootPath,
                                sourceFile
                            )} -> ${targetFile}`
                        );

                        fs.cpSync(sourceFile, targetFile);
                    });
                });
            }
        }
    );

    context.subscriptions.push(disposable);

    vscode.commands.registerCommand(
        "worktree.open",
        async (item: WorktreeNode) => {
            const uri = vscode.Uri.file(item.path!);

            await vscode.commands.executeCommand(
                "vscode.openFolder",
                uri,
                true
            );
        }
    );

    vscode.commands.registerCommand(
        "worktree.add",
        async (item: WorktreeNode) => {
            // vscode.window.showInformationMessage(
            //     `Successfully called add on ${item.id}`
            // );

            let correctBranchName = false;
            let branch: string | undefined;
            while (!correctBranchName) {
                branch = await vscode.window.showInputBox({
                    placeHolder: "Name of the worktree branch",
                });

                if (!branch) {
                    return;
                }

                correctBranchName =
                    branch.search(/^(?!.*--)[a-zA-Z0-9-]+$/) !== -1;
            }

            runGitCommand(item.path!, `worktree add ../${branch}`).then(() => {
                vscode.commands.executeCommand("worktree.refresh");
            });
        }
    );

    vscode.commands.registerCommand(
        "worktree.remove",
        async (item: WorktreeNode) => {
            // vscode.window.showInformationMessage(
            //     `Successfully called remove on ${item.id}`
            // );

            if (!item.branch) {
                return;
            }

            const option = await vscode.window.showQuickPick(
                ["Cancel", "Yes"],
                {
                    placeHolder: `Are you sure you want to remove ${item.branch}?`,
                }
            );

            if (option !== "Yes") {
                return;
            }

            runGitCommand(item.path!, `worktree remove ${item.branch}`)
                .catch(console.error)
                .finally(async () => {
                    // await deleteDir(item.path!);
                    fs.rmSync(item.path!);
                    vscode.commands.executeCommand("worktree.refresh");
                });
        }
    );

    WorktreeView.Initialize(rootPath!, context);

    const decorationProvider = new MyDecorationProvider();
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider)
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
