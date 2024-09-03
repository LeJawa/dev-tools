// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { globSync } from "glob";
import { WorktreeNode, WorktreeView } from "./worktreeView";
import { runGitCommand } from "./commandHelper";
import { MyDecorationProvider } from "./fileDecorator";
import { correctToolConfig, getConfigObj, rootPath } from "./configManager";
import { copyFromDependencies, copyToDependents } from "./copy";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "dev-tools" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "dev-tools.copyToDependents",
            copyToDependents
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "dev-tools.copyFromDependencies",
            copyFromDependencies
        )
    );

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
