"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var path = require("path");
function FileNameToUri(fileName) {
    var rootPath = "";
    vscode.workspace.workspaceFolders.forEach(function (workspaceFolder) {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    var filePath = path.join(rootPath, fileName);
    return vscode.Uri.file(filePath);
}
exports.FileNameToUri = FileNameToUri;
function ShortenFilePath(filePath) {
    var rootPath = "";
    vscode.workspace.workspaceFolders.forEach(function (workspaceFolder) {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    return EnsureLeadingSlash(filePath.replace(rootPath, "").replace("\\", "/"));
}
exports.ShortenFilePath = ShortenFilePath;
function GetShortFilePath(document) {
    var filePath = document.fileName;
    var rootPath = "";
    if (document.uri.scheme == "cloud9") {
        filePath = "/" + document.uri.path.split("/").slice(2).join('/');
    }
    vscode.workspace.workspaceFolders.forEach(function (workspaceFolder) {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    return filePath.replace(rootPath, "").replace("\\", "/");
}
exports.GetShortFilePath = GetShortFilePath;
function EnsureLeadingSlash(str) {
    if (str[0] == '/' || str[0] == '\\')
        return str;
    return "/" + str;
}
exports.EnsureLeadingSlash = EnsureLeadingSlash;
function GetRegion() {
    var extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    return extensionConfig.get('region');
}
exports.GetRegion = GetRegion;
function GetProxy() {
    var extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    var proxy = extensionConfig.get('proxy');
    if (proxy == "")
        return null;
    return proxy;
}
exports.GetProxy = GetProxy;
function ReducePromises(array, fn) {
    var results = [];
    return array.reduce(function (p, item) {
        return p.then(function () {
            return fn(item).then(function (data) {
                results.push(data);
                return results;
            }).catch(function (y) {
                console.error(y);
            });
        }).catch(function (x) {
            console.error(x);
        });
    }, Promise.resolve());
}
exports.ReducePromises = ReducePromises;
