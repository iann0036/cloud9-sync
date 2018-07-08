"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var path = require("path");
function FileNameToUri(fileName) {
    var filePath = path.join(vscode.workspace.rootPath, fileName);
    return vscode.Uri.file(filePath);
}
exports.FileNameToUri = FileNameToUri;
function ShortenFilePath(filePath) {
    return filePath.replace(vscode.workspace.rootPath, "").replace("\\", "/");
}
exports.ShortenFilePath = ShortenFilePath;
function EnsureLeadingSlash(str) {
    if (str[0] != '/' || str[0] != '\\')
        return "/" + str;
    return str;
}
exports.EnsureLeadingSlash = EnsureLeadingSlash;
function GetRegion() {
    var extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    return extensionConfig.get('region');
}
exports.GetRegion = GetRegion;
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
