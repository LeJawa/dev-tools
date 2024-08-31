import { exec } from "child_process";

export async function runGitCommand(
    directory: string,
    command: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(`cd ${directory} && git ${command}`, (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${stderr}`);
            } else {
                resolve(stdout);
            }
        });
    });
}
