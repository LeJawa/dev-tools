import * as vscode from "vscode";

export class MyDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<
        vscode.Uri | vscode.Uri[]
    > = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<
        vscode.Uri | vscode.Uri[]
    > = this._onDidChangeFileDecorations.event;

    provideFileDecoration(
        uri: vscode.Uri
    ): vscode.ProviderResult<vscode.FileDecoration> {
        // Customize the decoration based on the URI
        if (uri.path.endsWith("current")) {
            return {
                // badge: 'S',
                tooltip: "Current Workspace",
                color: new vscode.ThemeColor("list.deemphasizedForeground"),
            };
        }
        return undefined;
    }
}
