"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const aws4 = require("aws4");
const request = require("request");
const xml2js = require("xml2js");
var awsSession = null;
function promptForMFAIfRequired() {
    return new Promise((resolve, reject) => {
        let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
        if (extensionConfig.get('mfaSerial') != "") {
            vscode.window.showInputBox({
                placeHolder: "",
                prompt: "Enter your MFA code.",
                value: "",
                ignoreFocusOut: false
            }).then(function (mfa_token) {
                resolve("&TokenCode=" + mfa_token);
            });
        }
        else {
            resolve("");
        }
    });
}
function GetAWSCreds() {
    return new Promise((resolve, reject) => {
        let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
        let awsregion = extensionConfig.get('region');
        if (extensionConfig.get('accessKey') == "" ||
            extensionConfig.get('secretKey') == "" ||
            !extensionConfig.get('accessKey') ||
            !extensionConfig.get('secretKey')) {
            resolve(null);
        }
        if (awsSession) {
            resolve(awsSession['value']);
        }
        else if (extensionConfig.get('mfaSerial') != "" || extensionConfig.get('assumeRole') != "") {
            let path = "/?Version=2011-06-15&DurationSeconds=" + extensionConfig.get('sessionDuration');
            if (extensionConfig.get('mfaSerial') != "") {
                path += "&SerialNumber=" + extensionConfig.get('mfaSerial');
            }
            if (extensionConfig.get('assumeRole') != "") {
                path += '&Action=AssumeRole&RoleSessionName=VSCodeCloud9&RoleArn=' + extensionConfig.get('assumeRole');
            }
            else {
                path += '&Action=GetSessionToken';
            }
            promptForMFAIfRequired().then((mfa_token) => {
                path += mfa_token;
                let awsreq = aws4.sign({
                    service: 'sts',
                    region: 'us-east-1',
                    method: 'POST',
                    path: path,
                    headers: {
                        'Content-Type': 'application/x-amz-json-1.1'
                    },
                }, {
                    secretAccessKey: extensionConfig.get('secretKey'),
                    accessKeyId: extensionConfig.get('accessKey')
                });
                request.post({
                    url: "https://" + awsreq.hostname + awsreq.path,
                    headers: awsreq.headers,
                    body: awsreq.body,
                    rejectUnauthorized: false,
                    proxy: GetProxy()
                }, function (err, httpResponse, cred_response) {
                    console.log(httpResponse);
                    xml2js.parseString(cred_response, {
                        ignoreAttrs: true
                    }, function (err, result) {
                        // TODO: Handle failure here
                        let creds = null;
                        if (extensionConfig.get('assumeRole') != "") {
                            creds = result['AssumeRoleResponse']['AssumeRoleResult'][0]['Credentials'][0];
                        }
                        else {
                            creds = result['GetSessionTokenResponse']['GetSessionTokenResult'][0]['Credentials'][0];
                        }
                        awsSession = {
                            'value': {
                                secretAccessKey: creds['SecretAccessKey'][0],
                                accessKeyId: creds['AccessKeyId'][0],
                                sessionToken: creds['SessionToken'][0]
                            },
                            'expiry': creds['Expiration'][0]
                        };
                        // TODO: Handle refresh here
                        resolve(awsSession['value']);
                    });
                });
            });
        }
        else {
            resolve({
                secretAccessKey: extensionConfig.get('secretKey'),
                accessKeyId: extensionConfig.get('accessKey')
            });
        }
    });
}
exports.GetAWSCreds = GetAWSCreds;
function FileNameToUri(fileName) {
    let rootPath = "";
    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    const filePath = path.join(rootPath, fileName);
    return vscode.Uri.file(filePath);
}
exports.FileNameToUri = FileNameToUri;
function ShortenFilePath(filePath) {
    let rootPath = "";
    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    return EnsureLeadingSlash(filePath.replace(rootPath, "").replace("\\", "/"));
}
exports.ShortenFilePath = ShortenFilePath;
function GetShortFilePathByUri(uri) {
    let filePath = uri.path;
    let rootPath = "";
    if (uri.scheme == "cloud9") {
        filePath = "/" + uri.path.split("/").slice(2).join('/');
    }
    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
        if (workspaceFolder.uri.scheme == "file") {
            rootPath = workspaceFolder.uri.fsPath;
        }
    });
    return filePath.replace(rootPath, "").replace("\\", "/");
}
exports.GetShortFilePathByUri = GetShortFilePathByUri;
function GetShortFilePath(document) {
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
    let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    return extensionConfig.get('region');
}
exports.GetRegion = GetRegion;
function GetProxy() {
    let extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    let proxy = extensionConfig.get('proxy');
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
            }).catch((y) => {
                console.error(y);
            });
        }).catch((x) => {
            console.error(x);
        });
    }, Promise.resolve());
}
exports.ReducePromises = ReducePromises;
