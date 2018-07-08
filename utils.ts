import * as vscode from 'vscode';
import * as path from 'path';

export function FileNameToUri(fileName): vscode.Uri {
    const filePath = path.join(vscode.workspace.rootPath, fileName);
    return vscode.Uri.file(filePath);
}

export function ShortenFilePath(filePath): string {
    return filePath.replace(vscode.workspace.rootPath, "").replace("\\","/");
}

export function EnsureLeadingSlash(str): string {
    if (str[0] != '/' || str[0] != '\\')
        return "/" + str;
    return str;
}

export function GetRegion(): string {
    let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    return extensionConfig.get('region');
}

export function ReducePromises(array, fn) {
    var results = [];
    return array.reduce(function(p, item) {
        return p.then(function () {
            return fn(item).then(function (data) {
                results.push(data);
                return results;
            }).catch((y) => {
                console.error(y);
            });
        }).catch((x) => {
            console.error(x);
        });
    }, Promise.resolve());
}