"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var Utils = require("./utils");
var request = require("request");
var path = require("path");
var fs = require("fs");
var SYNC_TIME_VARIANCE = 20000;
var FileManager = /** @class */ (function () {
    function FileManager(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.awsregion = Utils.GetRegion();
    }
    FileManager.prototype.getFileWorkspacePath = function () {
        if (vscode.workspace.workspaceFolders) {
            var folders = vscode.workspace.workspaceFolders;
            var workspaceFolder = void 0;
            while (workspaceFolder = folders.pop()) {
                if (workspaceFolder.uri.scheme == "file") {
                    return workspaceFolder.uri.fsPath;
                }
            }
            ;
        }
        return null;
    };
    FileManager.prototype.recursiveDownload = function (startPath) {
        var _this = this;
        console.log("Performing lookup from " + startPath);
        return new Promise(function (resolve, reject) {
            request.get({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment' + startPath + "/",
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'text/plain',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                }
            }, function (err, httpResponse, body) {
                Utils.ReducePromises(JSON.parse(body), function (inode) {
                    if (startPath + "/" + inode['name'] == "/.c9" || startPath + "/" + inode['name'] == "/.vscode") {
                        return Promise.resolve();
                    }
                    var workspacePath = _this.getFileWorkspacePath();
                    if (workspacePath == null) {
                        vscode.window.showWarningMessage("Could not find local directory to sync to");
                        return Promise.reject();
                    }
                    var inodePath = path.join(workspacePath, startPath + "/" + inode['name']);
                    if (inode['mime'] == "inode/directory") {
                        if (!fs.existsSync(inodePath)) {
                            console.log("Creating the directory " + inodePath);
                            fs.mkdirSync(inodePath);
                        }
                        return _this.recursiveDownload(startPath + "/" + inode['name']);
                    }
                    else {
                        if (fs.existsSync(inodePath)) {
                            var ftime = inode['mtime'];
                            var fstat = fs.statSync(inodePath);
                            var lftime = new Date(fstat['mtime']).getTime();
                            console.log(lftime);
                            console.log(ftime);
                            if (lftime + SYNC_TIME_VARIANCE > ftime) {
                                console.log(inodePath + " is up to date, skipping...");
                                return Promise.resolve();
                            }
                        }
                        return _this.downloadFile(startPath + "/" + inode['name'], inodePath, inode);
                    }
                })
                    .then(resolve, reject)
                    .catch(function (err) {
                    console.error(err);
                });
            });
        });
    };
    FileManager.prototype.stat = function (filename) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.eventEmitter.emit('send_ch4_message', ["stat", "/" + filename, {}, { $: 91 }]);
            _this.eventEmitter.on('ch4_data', function (data, environmentId) {
                if (Array.isArray(data)) {
                    if (data.length > 2) {
                        if (data[0] == 91) {
                            var contents = data[2];
                            resolve(contents);
                        }
                    }
                }
            });
        });
    };
    FileManager.prototype.listdir = function (filename) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (!filename.endsWith("/")) {
                filename += "/";
            }
            request.get({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment/' + filename,
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                }
            }, function (err, httpResponse, body) {
                console.warn("LISTDIR RESPONSE");
                console.log(httpResponse);
                console.log(body);
                resolve(JSON.parse(body));
            });
        });
    };
    FileManager.prototype.downloadFile = function (filename, inodePath, inode) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            request.get({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment/' + filename,
                jar: _this.cookieJar,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                }
            }, function (err, httpResponse, body) {
                if (inodePath != null) {
                    console.log("Downloading the file " + inodePath);
                    fs.writeFileSync(inodePath, body);
                    //fs.utimes(inodePath, parseInt(inode.mtime/1000), parseInt(inode.mtime/1000), resolve); TODO: Fix
                }
                resolve(body); // REMOVE ME
            });
        });
    };
    FileManager.prototype.uploadExistingFile = function (filename, content) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            request.post({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment/' + filename,
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'text/plain',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                },
                body: content
            }, function (err, httpResponse, body) {
                console.log(httpResponse);
                console.log(body);
                resolve();
            });
        });
    };
    FileManager.prototype.uploadRemoteFile = function (filename, content) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            request.put({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment/' + filename,
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'text/plain',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                },
                body: content
            }, function (err, httpResponse, body) {
                var _this = this;
                console.log(httpResponse);
                console.log(body);
                if (httpResponse.statusCode == 429) { // retry with backoff
                    console.warn("retrying with backoff");
                    var response = JSON.parse(httpResponse);
                    setTimeout(function () {
                        _this.uploadRemoteFile(filename, content).then(function () {
                            resolve();
                        }).catch(function (err) {
                            reject(err);
                        });
                    }, response.error.retryIn);
                }
                else {
                    resolve();
                }
            });
        });
    };
    FileManager.prototype.deleteRemoteFile = function (filename) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            request.delete({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment/' + filename,
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'text/plain',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                }
            }, function (err, httpResponse, body) {
                console.log(err);
                console.log(httpResponse);
                console.log(body);
                resolve();
            });
        });
    };
    FileManager.prototype.recursiveUpload = function (startPath) {
        var _this = this;
        console.log("Performing lookup from " + startPath);
        return new Promise(function (resolve, reject) {
            var workspacePath = _this.getFileWorkspacePath();
            if (workspacePath == null) {
                vscode.window.showWarningMessage("Could not find local directory to sync to");
                reject("no local directory");
                return;
            }
            var inodePath = path.join(workspacePath, startPath + "/");
            request.get({
                url: 'https://vfs.cloud9.' + _this.awsregion + '.amazonaws.com/vfs/' + _this.environmentId + '/environment' + Utils.EnsureLeadingSlash(startPath) + "/",
                jar: _this.cookieJar,
                headers: {
                    'Content-Type': 'text/plain',
                    'Origin': 'https://' + _this.awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + _this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + _this.environmentId,
                    'x-authorization': _this.xauth
                }
            }, function (err, httpResponse, body) {
                console.log("REMOTE STAT FOR UPLOAD");
                console.log(err);
                console.log(body);
                var remoteStats = [];
                try {
                    remoteStats = JSON.parse(body);
                    if ('error' in remoteStats) {
                        reject();
                    }
                }
                catch (err) {
                    console.log("Could not get remote stats");
                    console.log(body);
                    resolve();
                }
                console.log("About to do readdir on" + inodePath);
                fs.readdir(inodePath, function (err, files) {
                    if (err)
                        reject(err);
                    console.log("Reading - " + inodePath);
                    console.log(files);
                    if (!files) {
                        console.log("No files, skipping...");
                        resolve();
                    }
                    Utils.ReducePromises(files, function (file) {
                        var relativePath = path.join(startPath + "/", file);
                        console.log("Processing file: " + relativePath);
                        if (relativePath == "/.c9" || relativePath == "/.vscode" || relativePath == "/.git") {
                            return Promise.resolve();
                        }
                        return new Promise(function (resolve, reject) {
                            var filepath = path.join(inodePath, file);
                            console.log("Beginning upload processing of " + filepath + " (" + relativePath + ")");
                            fs.stat(filepath, function (err, fstat) {
                                if (fstat.isDirectory()) {
                                    _this.eventEmitter.emit('send_ch4_message', ["mkdir", relativePath, {}, { "$": 33 }]);
                                    _this.recursiveUpload(relativePath).then(function () {
                                        resolve();
                                    }).catch(function (err) {
                                        console.error(err);
                                    });
                                }
                                else if (fstat.isFile()) {
                                    var ftime_1 = null;
                                    var lftime = new Date(fstat['mtime']).getTime();
                                    console.log("Checking remote stats now");
                                    remoteStats.forEach(function (remoteStat) {
                                        if (remoteStat.name == relativePath) {
                                            ftime_1 = remoteStat.mtime;
                                        }
                                    });
                                    console.log("ftime: " + ftime_1);
                                    if (ftime_1 == null) {
                                        console.log("Uploading new file");
                                        _this.uploadRemoteFile(relativePath, fs.readFileSync(filepath));
                                    }
                                    else if (lftime > ftime_1 + SYNC_TIME_VARIANCE) {
                                        console.log("Updating existing file");
                                        _this.uploadExistingFile(relativePath, fs.readFileSync(filepath));
                                    }
                                    resolve();
                                }
                                else {
                                    console.log("Unknown file type");
                                    resolve();
                                }
                            });
                        });
                    })
                        .then(resolve, reject)
                        .catch(function (err) {
                        console.error(err);
                    });
                });
            });
        });
    };
    return FileManager;
}());
exports.FileManager = FileManager;
