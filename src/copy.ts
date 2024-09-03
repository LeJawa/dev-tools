import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { globSync } from "glob";
import { correctToolConfig, getConfigObj, rootPath } from "./configManager";

function getPackageDependencyPath() {
    const packageConfig = JSON.parse(
        fs.readFileSync(path.join(rootPath, "package.json"), "utf-8")
    );

    if (!packageConfig.name || !packageConfig.files) {
        // Not a correctly defined package
        vscode.window.showErrorMessage(
            "package.json is missing either 'name' or 'files' property"
        );
        return;
    }

    const prefixToFiles = path.join(
        "node_modules",
        ...packageConfig.name.split("/")
    );

    return prefixToFiles;
}

export const copyToDependents = async () => {
    if (correctToolConfig()) {
        const config = getConfigObj();

        if (config === undefined) {
            return;
        }

        const prefixToFiles = getPackageDependencyPath();

        if (prefixToFiles === undefined) {
            return;
        }

        let dirTargets: string[] = [];

        config.dependents.forEach((dir) => {
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
            dirTargets.map((dir) => path.relative(path.join(dir, "../.."), dir))
        );

        const options = await vscode.window.showQuickPick(optionText, {
            placeHolder: "Select an option",
        });

        if (options === undefined) {
            return;
        }

        const filesToCopy: string[] = [];
        config.filesToCopy.forEach((file) => {
            const sourceFile = path.join(rootPath, file);

            // Glob only works with forward slashes
            const foundFiles = globSync(sourceFile.replaceAll("\\", "/"), {
                nodir: true,
            });

            foundFiles.forEach((foundFile) => {
                filesToCopy.push(path.relative(rootPath, foundFile));
            });
        });

        if (options !== "All") {
            dirTargets = [path.resolve(path.join(rootPath, "../..", options))];
        }

        dirTargets.forEach((targetPath) => {
            console.log(targetPath);
            filesToCopy.forEach((file) => {
                const sourceFile = path.join(rootPath, file);

                let targetFile = path.join(targetPath, prefixToFiles, file);

                console.log(
                    `- ${path.relative(rootPath, sourceFile)} -> ${targetFile}`
                );

                fs.cpSync(sourceFile, targetFile);
            });
        });
    }
};

export const copyFromDependencies = async () => {
    vscode.window.showErrorMessage("undefined command");
};
