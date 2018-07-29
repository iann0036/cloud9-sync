"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var path = require("path");
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
    function Cloud9FileSystemProvider(fileManager) {
        this.fileManager = fileManager;
        this.root = new Directory('');
        // --- manage file events
        this._emitter = new vscode.EventEmitter();
        this._bufferedEvents = [];
        this.onDidChangeFile = this._emitter.event;
        //this.createDirectory(vscode.Uri.parse(`cloud9:/123/`));
    }
    // --- manage file metadata
    Cloud9FileSystemProvider.prototype.stat = function (uri) {
        var _this = this;
        console.warn("stat");
        console.log(uri);
        return new Promise(function (resolve, reject) {
            _this.fileManager.stat("").then(function (ret) {
                console.warn("RET:");
                console.log(ret);
                if (uri.path == "/") {
                    console.log("Resolving");
                    resolve(_this.root);
                }
                else if (uri.path == "/something.txt") {
                    console.log("Resolving single");
                    resolve(new File("something.txt"));
                }
                else {
                    console.log("Throwing FNF");
                    reject(vscode.FileSystemError.FileNotFound());
                }
            });
        });
    };
    Cloud9FileSystemProvider.prototype.readDirectory = function (uri) {
        console.warn("readdir");
        console.log(uri);
        return new Promise(function (resolve, reject) {
            if (uri.path == "/") {
                console.log("resolving single");
                resolve([
                    ["/something.txt", vscode.FileType.File]
                ]);
            }
            else {
                console.log("resolving empty");
                resolve([]);
            }
        });
    };
    // --- manage file contents
    Cloud9FileSystemProvider.prototype.readFile = function (uri) {
        console.warn("readfile");
        console.log(uri);
        return this._lookupAsFile(uri, false).data;
    };
    Cloud9FileSystemProvider.prototype.writeFile = function (uri, content, options) {
        var basename = path.posix.basename(uri.path);
        var parent = this._lookupParentDirectory(uri);
        var entry = parent.entries.get(basename);
        if (entry instanceof Directory) {
            throw vscode.FileSystemError.FileIsADirectory(uri);
        }
        if (!entry && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        if (entry && options.create && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }
        if (!entry) {
            entry = new File(basename);
            parent.entries.set(basename, entry);
            this._fireSoon({ type: vscode.FileChangeType.Created, uri: uri });
        }
        entry.mtime = Date.now();
        entry.size = content.byteLength;
        entry.data = content;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri });
    };
    // --- manage files/folders
    Cloud9FileSystemProvider.prototype.rename = function (oldUri, newUri, options) {
        if (!options.overwrite && this._lookup(newUri, true)) {
            throw vscode.FileSystemError.FileExists(newUri);
        }
        var entry = this._lookup(oldUri, false);
        var oldParent = this._lookupParentDirectory(oldUri);
        var newParent = this._lookupParentDirectory(newUri);
        var newName = path.posix.basename(newUri.path);
        oldParent.entries.delete(entry.name);
        entry.name = newName;
        newParent.entries.set(newName, entry);
        this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri }, { type: vscode.FileChangeType.Created, uri: newUri });
    };
    Cloud9FileSystemProvider.prototype.delete = function (uri) {
        var dirname = uri.with({ path: path.posix.dirname(uri.path) });
        var basename = path.posix.basename(uri.path);
        var parent = this._lookupAsDirectory(dirname, false);
        if (!parent.entries.has(basename)) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        parent.entries.delete(basename);
        parent.mtime = Date.now();
        parent.size -= 1;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri: uri, type: vscode.FileChangeType.Deleted });
    };
    Cloud9FileSystemProvider.prototype.createDirectory = function (uri) {
        var basename = path.posix.basename(uri.path);
        var dirname = uri.with({ path: path.posix.dirname(uri.path) });
        var parent = this._lookupAsDirectory(dirname, false);
        var entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri: uri });
    };
    Cloud9FileSystemProvider.prototype._lookup = function (uri, silent) {
        var parts = uri.path.split('/');
        var entry = this.root;
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            if (!part) {
                continue;
            }
            var child = void 0;
            if (entry instanceof Directory) {
                child = entry.entries.get(part);
            }
            if (!child) {
                if (!silent) {
                    throw vscode.FileSystemError.FileNotFound(uri);
                }
                else {
                    return undefined;
                }
            }
            entry = child;
        }
        return entry;
    };
    Cloud9FileSystemProvider.prototype._lookupAsDirectory = function (uri, silent) {
        var entry = this._lookup(uri, silent);
        if (entry instanceof Directory) {
            return entry;
        }
        throw vscode.FileSystemError.FileNotADirectory(uri);
    };
    Cloud9FileSystemProvider.prototype._lookupAsFile = function (uri, silent) {
        var entry = this._lookup(uri, silent);
        if (entry instanceof File) {
            return entry;
        }
        throw vscode.FileSystemError.FileIsADirectory(uri);
    };
    Cloud9FileSystemProvider.prototype._lookupParentDirectory = function (uri) {
        var dirname = uri.with({ path: path.posix.dirname(uri.path) });
        return this._lookupAsDirectory(dirname, false);
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
