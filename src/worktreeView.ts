import * as vscode from "vscode";
import * as path from "path";
import { runGitCommand } from "./commandHelper";

export class WorktreeView {
    private timer: NodeJS.Timeout | undefined;
    private clickedNode: vscode.TreeItem | undefined;

    constructor(treeInfo: WorktreeTreeInfo, context: vscode.ExtensionContext) {
        const worktreeProvider = new WorktreeProvider(treeInfo);

        const view = vscode.window.createTreeView("worktree-view", {
            treeDataProvider: worktreeProvider,
            showCollapseAll: true,
        });

        vscode.commands.registerCommand("worktree.refresh", () =>
            worktreeProvider.refresh()
        );

        context.subscriptions.push(view);

        // view.onDidChangeSelection((e) => this.onClick(e.selection[0]));
    }

    private onClick(node: WorktreeNode) {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
            if (this.clickedNode === node) {
                // Handle double click
                vscode.commands.executeCommand("worktree.open", node);
                this.clickedNode = undefined;
                return;
            }
        }

        // Handle single click
        this.timer = setTimeout(() => {
            this.clickedNode = undefined;
            this.timer = undefined;
        }, 2000); // Adjust the delay as needed

        this.clickedNode = node;
    }

    static async Initialize(
        rootPath: string,
        context: vscode.ExtensionContext
    ) {
        let repo: string = await getRepoName(rootPath);

        InitializeWorktreeViewFromRepo(repo, rootPath, context);
    }
}

export class WorktreeNode {
    path?: string;
    id: string;

    gitRepo: string;
    branch?: string;
    current: boolean;

    constructor(
        gitRepo: string,
        branch?: string,
        path?: string,
        current?: boolean
    ) {
        this.path = path;

        this.id = branch ? `${gitRepo}@${branch}` : gitRepo;
        this.gitRepo = gitRepo;
        this.branch = branch;

        this.current = current === true;
    }
}

class WorktreeProvider implements vscode.TreeDataProvider<WorktreeNode> {
    private _repoName: string;
    private _workspacePath: string;

    private _tree: { [repo: string]: string[] } = {};
    private _nodes: { [id: string]: WorktreeNode } = {};

    constructor(treeInfo: WorktreeTreeInfo) {
        this._repoName = treeInfo.repoName;
        this._workspacePath = treeInfo.workspacePath;

        this._tree = treeInfo.tree;
        this._nodes = treeInfo.nodes;
    }

    private _onDidChangeTreeData = new vscode.EventEmitter<
        WorktreeNode | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    async refresh(): Promise<void> {
        const info = await getWorktreeTreeInfo(
            this._repoName,
            this._workspacePath
        );

        this._tree = info.tree;
        this._nodes = info.nodes;

        this._onDidChangeTreeData.fire(undefined);
    }

    getChildren(element?: WorktreeNode): WorktreeNode[] {
        // if root
        if (!element) {
            return Object.keys(this._tree).map((id) => this._nodes[id]);
        }

        const repoWorktrees = this._tree[element.id!];

        return repoWorktrees ? repoWorktrees.map((id) => this._nodes[id]) : [];
    }

    getTreeItem(element: WorktreeNode): vscode.TreeItem {
        const isRepo = !element.branch;
        const isCurrentWorkspace = element.current;

        let label: string | undefined;
        let collapsibleState: vscode.TreeItemCollapsibleState;
        let tooltip: string | undefined;
        let contextValue: string | undefined;

        let icon: vscode.ThemeIcon = undefined!;
        let resourceUri = vscode.Uri.file("/worktree-view/" + element.id);

        if (isRepo) {
            label = element.gitRepo;
            collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            tooltip = undefined;
            contextValue = "repo";
            icon = new vscode.ThemeIcon("git-merge");
        } else {
            collapsibleState = vscode.TreeItemCollapsibleState.None;
            tooltip = `${element.gitRepo}@${element.branch} worktree`;
            if (isCurrentWorkspace) {
                label = `${element.branch}`;
                contextValue = "current-workspace";

                icon = new vscode.ThemeIcon("circle-filled");
                resourceUri = vscode.Uri.file(
                    "/worktree-view/" + element.id + "+current"
                );
            } else {
                label = element.branch;
                contextValue = "worktree";

                icon = new vscode.ThemeIcon("circle-outline");
            }
        }

        return {
            label: label,
            tooltip: tooltip,
            collapsibleState: collapsibleState,
            contextValue: contextValue,
            iconPath: icon,
            resourceUri: resourceUri,
        };
    }
}

interface WorktreeTreeInfo {
    repoName: string;
    workspacePath: string;
    tree: { [repo: string]: string[] };
    nodes: { [id: string]: WorktreeNode };
}

async function getWorktreeTreeInfo(
    repoName: string,
    workspacePath: string
): Promise<WorktreeTreeInfo> {
    const tree: { [repo: string]: string[] } = {};
    const nodes: { [id: string]: WorktreeNode } = {};

    tree[repoName] = [];
    nodes[repoName] = new WorktreeNode(repoName, undefined, workspacePath);

    await runGitCommand(workspacePath!, "worktree list")
        .then((output) => {
            const lines = output.split("\n").filter((line) => line !== "");

            lines.forEach((line) => {
                const split = line.split(" ");
                const branch = split.at(-1)!.slice(1, -1);
                const worktreePath = split[0];

                const isCurrentDir =
                    path.relative(workspacePath!, worktreePath) === "";

                const node = new WorktreeNode(
                    repoName,
                    branch,
                    worktreePath,
                    isCurrentDir
                );

                nodes[node.id] = node;
                tree[repoName].push(node.id);
            });
        })
        .catch(console.error);

    return {
        repoName: repoName,
        workspacePath: workspacePath,
        tree: tree,
        nodes: nodes,
    };
}

async function InitializeWorktreeViewFromRepo(
    repo: string,
    rootPath: string,
    context: vscode.ExtensionContext
) {
    const info = await getWorktreeTreeInfo(repo, rootPath);

    new WorktreeView(info, context);
}

async function getRepoName(workspacePath: string): Promise<string> {
    let repo: string = "";
    await runGitCommand(workspacePath, "config --get remote.origin.url")
        .then((value) => {
            if (value) {
                const temp = value.replaceAll("\\", "/");
                repo = temp.split("/").at(-1)!.replace("\n", "");
                if (repo.includes(".git")) {
                    repo = repo.slice(0, -4);
                }
            } else {
                // Empty remote url. Does this happen?
                // In any case, take folder name
                repo = workspacePath.replaceAll("\\", "/").split("/").at(-1)!;
            }
        })
        .catch(() => {
            repo = workspacePath.replaceAll("\\", "/").split("/").at(-1)!;
        });

    return repo;
}
