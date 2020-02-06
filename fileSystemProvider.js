"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const text_encoding_1 = require("text-encoding");
class File {
    constructor(name) {
        this.type = vscode.FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
    }
}
exports.File = File;
class Directory {
    constructor(name) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.entries = new Map();
    }
}
exports.Directory = Directory;
class Cloud9FileSystemProvider {
    constructor(fileManager, eventEmitter, websocketProvider) {
        this.fileManager = fileManager;
        this.eventEmitter = eventEmitter;
        this.websocketProvider = websocketProvider;
        this.root = new Directory('');
        this.environmentConnections = {};
        // --- manage file events
        this._emitter = new vscode.EventEmitter();
        this._bufferedEvents = [];
        this.onDidChangeFile = this._emitter.event;
        //this.createDirectory(vscode.Uri.parse(`cloud9:/123/`));
    }
    // --- manage file metadata
    _getEnvConnection(id) {
        return new Promise((resolve, reject) => {
            if (id in this.environmentConnections) {
                if (this.environmentConnections[id].status == "connected") {
                    resolve(id);
                    return;
                }
            }
            else {
                this.environmentConnections[id] = {
                    'status': 'connecting'
                };
                this.eventEmitter.emit("request_connect", {
                    id: id
                });
            }
            this.eventEmitter.once('websocket_init_complete', () => {
                this.environmentConnections[id] = {
                    'status': 'connected'
                };
                resolve(id);
            });
        });
    }
    _c9stattovsstat(stat) {
        let entry;
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
    }
    stat(uri) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.stat(splituri.slice(2).join('/')).then(stats => {
                    resolve(this._c9stattovsstat(stats));
                }).catch(err => {
                    reject(err);
                });
            });
        });
        //reject(vscode.FileSystemError.FileNotFound());
    }
    readDirectory(uri) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.listdir(splituri.slice(2).join('/')).then(stats => {
                    let converted_stats = [];
                    stats.forEach(stat => {
                        let converted_stat = [stat['name'], vscode.FileType.File];
                        if (stat['mime'] == "inode/directory") {
                            converted_stat[1] = vscode.FileType.Directory;
                        }
                        converted_stats.push(converted_stat);
                    });
                    resolve(converted_stats);
                });
            });
        });
    }
    // --- manage file contents
    readFile(uri) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.downloadFile("/" + splituri.slice(2).join('/'), null, null).then(body => {
                    let uint8 = new text_encoding_1.TextEncoder().encode(body);
                    resolve(uint8);
                });
            });
        });
    }
    writeFile(uri, content, options) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                if (options.create) {
                    this.fileManager.uploadRemoteFile("/" + splituri.slice(2).join('/'), content.toString()).then(() => {
                        resolve();
                        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
                        return;
                    });
                }
                else if (options.overwrite) {
                    this.fileManager.uploadExistingFile("/" + splituri.slice(2).join('/'), content.toString()).then(() => {
                        resolve();
                        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
                        return;
                    });
                }
            });
        });
    }
    // --- manage files/folders
    rename(oldUri, newUri, options) {
        let oldsplituri = oldUri.path.split("/");
        let newsplituri = newUri.path.split("/");
        this.eventEmitter.emit("send_ch4_message", ["rename", "/" + newsplituri.slice(2).join('/'), { "from": "/" + oldsplituri.slice(2).join('/') }, { "$": this.websocketProvider.next_event_id() }]);
        this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri }, { type: vscode.FileChangeType.Created, uri: newUri });
    }
    delete(uri) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.deleteRemoteFile("/" + splituri.slice(2).join('/')).then(() => {
                    resolve();
                    this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { uri, type: vscode.FileChangeType.Deleted });
                    return;
                });
            });
        });
    }
    createDirectory(uri) {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            this.eventEmitter.emit("send_ch4_message", ["mkdir", "/" + splituri.slice(2).join('/'), {}, { "$": this.websocketProvider.next_event_id() }]);
            setTimeout(() => {
                this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { type: vscode.FileChangeType.Created, uri });
                resolve();
            }, 200);
        });
    }
    watch(resource, opts) {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => { });
    }
    _fireSoon(...events) {
        this._bufferedEvents.push(...events);
        clearTimeout(this._fireSoonHandle);
        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}
exports.Cloud9FileSystemProvider = Cloud9FileSystemProvider;
