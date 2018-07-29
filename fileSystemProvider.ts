import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';
import * as FileManager from './fileManager';
import { resolve } from 'dns';

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

    constructor(
        private fileManager: FileManager.FileManager
    ) {
        //this.createDirectory(vscode.Uri.parse(`cloud9:/123/`));
    }

    // --- manage file metadata

    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
        console.warn("stat");
        console.log(uri);

        return new Promise((resolve, reject) => {
            this.fileManager.stat("").then(ret => {
                console.warn("RET:");
                console.log(ret);
                if (uri.path == "/") {
                    console.log("Resolving");
                    resolve(this.root);
                } else if (uri.path == "/something.txt") {
                    console.log("Resolving single");
                    resolve(new File("something.txt"));
                } else {
                    console.log("Throwing FNF");
                    reject(vscode.FileSystemError.FileNotFound());
                }
            });
        });
    }

    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
        
        console.warn("readdir");
        console.log(uri);
        return new Promise((resolve, reject) => {
            if (uri.path == "/") {
                console.log("resolving single");
                resolve([
                    ["/something.txt",vscode.FileType.File]
                ])
            } else {
                console.log("resolving empty");
                resolve([]);
            }
        });
    }

    // --- manage file contents

    readFile(uri: vscode.Uri): Uint8Array {
        console.warn("readfile");
        console.log(uri);
        return this._lookupAsFile(uri, false).data;
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
        let basename = path.posix.basename(uri.path);
        let parent = this._lookupParentDirectory(uri);
        let entry = parent.entries.get(basename);
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
            this._fireSoon({ type: vscode.FileChangeType.Created, uri });
        }
        entry.mtime = Date.now();
        entry.size = content.byteLength;
        entry.data = content;

        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
    }

    // --- manage files/folders

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {

        if (!options.overwrite && this._lookup(newUri, true)) {
            throw vscode.FileSystemError.FileExists(newUri);
        }

        let entry = this._lookup(oldUri, false);
        let oldParent = this._lookupParentDirectory(oldUri);

        let newParent = this._lookupParentDirectory(newUri);
        let newName = path.posix.basename(newUri.path);

        oldParent.entries.delete(entry.name);
        entry.name = newName;
        newParent.entries.set(newName, entry);

        this._fireSoon(
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri }
        );
    }

    delete(uri: vscode.Uri): void {
        let dirname = uri.with({ path: path.posix.dirname(uri.path) });
        let basename = path.posix.basename(uri.path);
        let parent = this._lookupAsDirectory(dirname, false);
        if (!parent.entries.has(basename)) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        parent.entries.delete(basename);
        parent.mtime = Date.now();
        parent.size -= 1;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri, type: vscode.FileChangeType.Deleted });
    }

    createDirectory(uri: vscode.Uri): void {
        let basename = path.posix.basename(uri.path);
        let dirname = uri.with({ path: path.posix.dirname(uri.path) });
        let parent = this._lookupAsDirectory(dirname, false);

        let entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
    }

    // --- lookup

    private _lookup(uri: vscode.Uri, silent: false): Entry;
    private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined;
    private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined {
        let parts = uri.path.split('/');
        let entry: Entry = this.root;
        for (const part of parts) {
            if (!part) {
                continue;
            }
            let child: Entry | undefined;
            if (entry instanceof Directory) {
                child = entry.entries.get(part);
            }
            if (!child) {
                if (!silent) {
                    throw vscode.FileSystemError.FileNotFound(uri);
                } else {
                    return undefined;
                }
            }
            entry = child;
        }
        return entry;
    }

    private _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Directory {
        let entry = this._lookup(uri, silent);
        if (entry instanceof Directory) {
            return entry;
        }
        throw vscode.FileSystemError.FileNotADirectory(uri);
    }

    private _lookupAsFile(uri: vscode.Uri, silent: boolean): File {
        let entry = this._lookup(uri, silent);
        if (entry instanceof File) {
            return entry;
        }
        throw vscode.FileSystemError.FileIsADirectory(uri);
    }

    private _lookupParentDirectory(uri: vscode.Uri): Directory {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        return this._lookupAsDirectory(dirname, false);
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
