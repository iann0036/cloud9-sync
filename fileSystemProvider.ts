import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';
import * as FileManager from './fileManager';
import { resolve } from 'dns';
import { TextEncoder } from 'text-encoding';

export class File implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;

    name: string;
    data: Uint8Array;

    constructor(name: string) {
        this.type = vscode.FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
    }
}

export class Directory implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;

    name: string;
    entries: Map<string, File | Directory>;

    constructor(name: string) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.entries = new Map();
    }
}

export type Entry = File | Directory;

export class Cloud9FileSystemProvider implements vscode.FileSystemProvider {

    root = new Directory('');
    environmentConnections = {}

    constructor(
        private fileManager: FileManager.FileManager,
        private eventEmitter
    ) {
        //this.createDirectory(vscode.Uri.parse(`cloud9:/123/`));
    }

    // --- manage file metadata

    private _getEnvConnection(id): Thenable<string> {
        return new Promise((resolve, reject) => {
            if (id in this.environmentConnections) {
                if (this.environmentConnections[id].status == "connected") {
                    resolve(id);
                    return;
                }
            } else {
                this.environmentConnections[id] = {
                    'status': 'connecting'
                };
                this.eventEmitter.emit("request_connect", {
                    id: id
                });
            }

            this.eventEmitter.once('websocket_init_complete', () => {
                console.warn("WEBSOCK COMPLETE FS PROVIDER");
                this.environmentConnections[id] = {
                    'status': 'connected'
                };
                resolve(id);
            });
        });
    }

    private _c9stattovsstat(stat): Entry {
        let entry: Entry;

        if (stat['mime'] == "inode/directory") {
            entry = new Directory(stat.name);
        } else {
            entry = new File(stat.name);
        }

        entry.size = stat.size;
        entry.ctime = stat.ctime;
        entry.mtime = stat.mtime;

        return entry;
    }

    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
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

    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.listdir(splituri.slice(2).join('/')).then(stats => {
                    let converted_stats = [];
                    stats.forEach(stat => {
                        let converted_stat = [splituri.slice(2).join('/') + stat['name'], vscode.FileType.File];
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

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return new Promise((resolve, reject) => {
            let splituri = uri.path.split("/");
            let environmentId = splituri[1];
            this._getEnvConnection(environmentId).then(() => {
                this.fileManager.downloadFile("/" + splituri.slice(2).join('/'), null, null).then(body => {
                    let uint8 = new TextEncoder().encode(body);
                    resolve(uint8);
                });
            });
        });
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
        ;

        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
    }

    // --- manage files/folders

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        ;

        this._fireSoon(
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri }
        );
    }

    delete(uri: vscode.Uri): void {
        ;

        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { uri, type: vscode.FileChangeType.Deleted });
    }

    createDirectory(uri: vscode.Uri): void {
        ;

        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: uri }, { type: vscode.FileChangeType.Created, uri });
    }

    // --- manage file events

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private _bufferedEvents: vscode.FileChangeEvent[] = [];
    private _fireSoonHandle: NodeJS.Timer;

    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(resource: vscode.Uri, opts): vscode.Disposable {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => { });
    }

    private _fireSoon(...events: vscode.FileChangeEvent[]): void {
        this._bufferedEvents.push(...events);
        clearTimeout(this._fireSoonHandle);
        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}
