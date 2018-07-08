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
                    var inodePath = path.join(vscode.workspace.rootPath, startPath + "/" + inode['name']);
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
                console.log("Creating the file " + inodePath);
                fs.writeFileSync(inodePath, body);
                //fs.utimes(inodePath, parseInt(inode.mtime/1000), parseInt(inode.mtime/1000), resolve); TODO: Fix
                resolve(); // REMOVE ME
            });
        });
    };
    FileManager.prototype.uploadExistingFile = function (filename, content) {
        request.post({
            url: 'https://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + this.environmentId + '/environment/' + filename,
            jar: this.cookieJar,
            headers: {
                'Content-Type': 'text/plain',
                'Origin': 'https://' + this.awsregion + '.console.aws.amazon.com',
                'Referer': 'https://' + this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + this.environmentId,
                'x-authorization': this.xauth
            },
            body: content
        }, function (err, httpResponse, body) {
            console.log(httpResponse);
            console.log(body);
        });
    };
    FileManager.prototype.uploadRemoteFile = function (filename, content) {
        request.put({
            url: 'https://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + this.environmentId + '/environment/' + filename,
            jar: this.cookieJar,
            headers: {
                'Content-Type': 'text/plain',
                'Origin': 'https://' + this.awsregion + '.console.aws.amazon.com',
                'Referer': 'https://' + this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + this.environmentId,
                'x-authorization': this.xauth
            },
            body: content
        }, function (err, httpResponse, body) {
            console.log(httpResponse);
            console.log(body);
        });
    };
    FileManager.prototype.deleteRemoteFile = function (filename) {
        request.delete({
            url: 'https://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + this.environmentId + '/environment/' + filename,
            jar: this.cookieJar,
            headers: {
                'Content-Type': 'text/plain',
                'Origin': 'https://' + this.awsregion + '.console.aws.amazon.com',
                'Referer': 'https://' + this.awsregion + '.console.aws.amazon.com/cloud9/ide/' + this.environmentId,
                'x-authorization': this.xauth
            }
        }, function (err, httpResponse, body) {
            console.log(err);
            console.log(httpResponse);
            console.log(body);
        });
    };
    FileManager.prototype.recursiveUpload = function (startPath) {
        var _this = this;
        console.log("Performing lookup from " + startPath);
        return new Promise(function (resolve, reject) {
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
                var inodePath = path.join(vscode.workspace.rootPath, startPath + "/");
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
