import * as vscode from 'vscode';
import * as path from 'path';

export function FileNameToUri(fileName): vscode.Uri {
    let rootPath = "";

    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });

    const filePath = path.join(rootPath, fileName);
    return vscode.Uri.file(filePath);
}

export function ShortenFilePath(filePath): string {
    let rootPath = "";

    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });

    return EnsureLeadingSlash(filePath.replace(rootPath, "").replace("\\","/"));
}

export function GetShortFilePath(document: vscode.TextDocument): string {
    let filePath = document.fileName;
    let rootPath = "";
    
    if (document.uri.scheme == "cloud9") {
        filePath = "/" + document.uri.path.split("/").slice(2).join('/');
    }

    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });

    return filePath.replace(rootPath, "").replace("\\","/");
}

export function EnsureLeadingSlash(str): string {
    if (str[0] == '/' || str[0] == '\\')
        return str;
    return "/" + str;
}

export function GetRegion(): string {
    let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    return extensionConfig.get('region');
}

export function GetProxy(): string | null {
    let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    let proxy: string = extensionConfig.get('proxy');

    if (proxy == "")
        return null;

    return proxy;
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