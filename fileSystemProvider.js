"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var text_encoding_1 = require("text-encoding");
var File = /** @class */ (function () {
    function File(name) {
        this.type = vscode.FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
    }
    return File;
}());
exports.File = File;
var Directory = /** @class */ (function () {
    function Directory(name) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.entries = new Map();
    }
    return Directory;
}());
exports.Directory = Directory;
var Cloud9FileSystemProvider = /** @class */ (function () {
    function Cloud9FileSystemProvider(fileManager, eventEmitter) {
        this.fileManager = fileManager;
        this.eventEmitter = eventEmitter;
        this.root = new Directory('');
        this.environmentConnections = {};
        // --- manage file events
        this._emitter = new vscode.EventEmitter();
        this._bufferedEvents = [];
        this.onDidChangeFile = this._emitter.event;
        //this.createDirectory(vscode.Uri.parse(`cloud9:/123/`));
    }
    // --- manage file metadata
    Cloud9FileSystemProvider.prototype._getEnvConnection = function (id) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (id in _this.environmentConnections) {
                if (_this.environmentConnections[id].status == "connected") {
                    resolve(id);
                    return;
                }
            }
            else {
                _this.environmentConnections[id] = {
                    'status': 'connecting'
                };
                _this.eventEmitter.emit("request_connect", {
                    id: id
                });
            }
            _this.eventEmitter.once('websocket_init_complete', function () {
                console.warn("WEBSOCK COMPLETE FS PROVIDER");
                _this.environmentConnections[id] = {
                    'status': 'connected'
                };
                resolve(id);
            });
        });
    };
    Cloud9FileSystemProvider.prototype._c9stattovsstat = function (stat) {
        var entry;
        if (stat['mime'] == "inode/directory") {
            entry = new Directory(stat.name);
        }
        else {
            entry = new File(stat.name);
        }
        entry.size = stat.size;
        entry.ctime = stat.ctime;
        entry.mtime = stat.mtime;
        return entry;
    };
    Cloud9FileSystemProvider.prototype.stat = function (uri) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            var environmentId = splituri[1];
            _this._getEnvConnection(environmentId).then(function () {
                _this.fileManager.stat(splituri.slice(2).join('/')).then(function (stats) {
                    resolve(_this._c9stattovsstat(stats));
                }).catch(function (err) {
                    reject(err);
                });
            });
        });
        //reject(vscode.FileSystemError.FileNotFound());
    };
    Cloud9FileSystemProvider.prototype.readDirectory = function (uri) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            var environmentId = splituri[1];
            _this._getEnvConnection(environmentId).then(function () {
                _this.fileManager.listdir(splituri.slice(2).join('/')).then(function (stats) {
                    var converted_stats = [];
                    stats.forEach(function (stat) {
                        var converted_stat = [stat['name'], vscode.FileType.File];
                        if (stat['mime'] == "inode/directory") {
                            converted_stat[1] = vscode.FileType.Directory;
                        }
                        converted_stats.push(converted_stat);
                    });
                    resolve(converted_stats);
                });
            });
        });
    };
    // --- manage file contents
    Cloud9FileSystemProvider.prototype.readFile = function (uri) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            var environmentId = splituri[1];
            _this._getEnvConnection(environmentId).then(function () {
                _this.fileManager.downloadFile("/" + splituri.slice(2).join('/'), null, null).then(function (body) {
                    var uint8 = new text_encoding_1.TextEncoder().encode(body);
                    resolve(uint8);
                });
            });
        });
    };
    Cloud9FileSystemProvider.prototype.writeFile = function (uri, content, options) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            var environmentId = splituri[1];
            _this._getEnvConnection(environmentId).then(function () {
                if (options.create) {
                    _this.fileManager.uploadRemoteFile("/" + splituri.slice(2).join('/'), content.toString()).then(function () {
                        resolve();
                        _this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri });
                        return;
                    });
                }
                else if (options.overwrite) {
                    _this.fileManager.uploadExistingFile("/" + splituri.slice(2).join('/'), content.toString()).then(function () {
                        resolve();
                        _this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri });
                        return;
                    });
                }
            });
        });
    };
    // --- manage files/folders
    Cloud9FileSystemProvider.prototype.rename = function (oldUri, newUri, options) {
        var oldsplituri = oldUri.path.split("/");
        var newsplituri = newUri.path.split("/");
        this.eventEmitter.emit("send_ch4_message", ["rename", "/" + newsplituri.slice(2).join('/'), { "from": "/" + oldsplituri.slice(2).join('/') }, { "$": 92 }]);
        this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri }, { type: vscode.FileChangeType.Created, uri: newUri });
    };
    Cloud9FileSystemProvider.prototype.delete = function (uri) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            var environmentId = splituri[1];
            _this._getEnvConnection(environmentId).then(function () {
                _this.fileManager.deleteRemoteFile("/" + splituri.slice(2).join('/')).then(function () {
                    resolve();
                    _this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { uri: uri, type: vscode.FileChangeType.Deleted });
                    return;
                });
            });
        });
    };
    Cloud9FileSystemProvider.prototype.createDirectory = function (uri) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var splituri = uri.path.split("/");
            _this.eventEmitter.emit("send_ch4_message", ["mkdir", "/" + splituri.slice(2).join('/'), {}, { "$": 93 }]);
            setTimeout(function () {
                _this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { type: vscode.FileChangeType.Created, uri: uri });
                resolve();
            }, 200);
        });
    };
    Cloud9FileSystemProvider.prototype.watch = function (resource, opts) {
        // ignore, fires for all changes...
        return new vscode.Disposable(function () { });
    };
    Cloud9FileSystemProvider.prototype._fireSoon = function () {
        var _a;
        var _this = this;
        var events = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            events[_i] = arguments[_i];
        }
        (_a = this._bufferedEvents).push.apply(_a, events);
        clearTimeout(this._fireSoonHandle);
        this._fireSoonHandle = setTimeout(function () {
            _this._emitter.fire(_this._bufferedEvents);
            _this._bufferedEvents.length = 0;
        }, 5);
    };
    return Cloud9FileSystemProvider;
}());
exports.Cloud9FileSystemProvider = Cloud9FileSystemProvider;
