"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class TerminalManager {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.terminals = {};
        eventEmitter.on('terminal_process_created', (pty) => {
            this.terminals[pty["id"]] = {
                "terminal": this.lastCreatedTerminal,
                "pid": parseInt(pty["pid"]),
                "tid": this.lastTid,
                "shared": this.lastTerminalIsShared,
                "owner": this.vfsid
            };
            this.lastCreatedTerminal.onDidAcceptInput(data => {
                this.eventEmitter.emit('send_ch4_message', ["write", pty["id"], data.toString()]);
            });
            this.lastCreatedTerminal.terminal.show();
            this.eventEmitter.emit('send_ch4_message', ["resize", pty["pid"], 159, 33]);
            this.eventEmitter.emit('send_ch4_message', ["tmux", "", { "capturePane": { "start": -32768, "end": 1000, "pane": "cloud9_terminal_" + this.lastTid + ":0.0" }, "encoding": "utf8", "name": "xterm-color", "command": "" }, { "$": pty["id"] }]);
            if (!this.lastTerminalIsShared) {
                this.eventEmitter.emit('send_ch4_message', // detach other clients if not shared
                ["write", pty["id"], ":detach -a\n"]);
            }
        });
        eventEmitter.on('ch4_data', (data, environmentId) => {
            if (Array.isArray(data)) {
                if (data.length > 2) {
                    if (data[0] == "onEnd") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Terminating terminal");
                            this.closeTerminal(this.terminals[data[1]]);
                            delete this.terminals[data[1]];
                        }
                    }
                    else if (data[0] == "onData") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Emitting terminal data");
                            this.emitTerminalData(this.terminals[data[1]], data[2]);
                        }
                        try {
                            let xd = JSON.parse(data[2]);
                            if (xd['type'] == "GENERIC_BROADCAST" && xd['data']['sender'] != this.vfsid) {
                                if (xd['data']['exttype'] == 'terminal_create') {
                                    let terminal = vscode.window.createTerminalRenderer("Shared Cloud9 Terminal");
                                    this.terminals['shared_' + xd['data']['tid']] = {
                                        "terminal": terminal,
                                        "pid": null,
                                        "tid": xd['data']['tid'],
                                        "shared": true,
                                        "owner": xd['data']['sender']
                                    };
                                    terminal.terminal.show();
                                }
                                else if (xd['data']['exttype'] == 'terminal_data') {
                                    if ('shared_' + xd['data']['tid'] in this.terminals) {
                                        this.terminals['shared_' + xd['data']['tid']]['terminal'].write(xd['data']['data']);
                                    }
                                }
                                else if (xd['data']['exttype'] == 'terminal_destroy') {
                                    if ('shared_' + xd['data']['tid'] in this.terminals) {
                                        this.terminals['shared_' + xd['data']['tid']]['terminal'].terminal.dispose();
                                    }
                                }
                            }
                        }
                        catch (err) { }
                    }
                    else if (data[0] == 90) { // terminal creation channel
                        let contents = data[2];
                        console.log("Terminal Process Created");
                        eventEmitter.emit('terminal_process_created', contents["pty"]);
                    }
                }
            }
        });
        vscode.window.onDidCloseTerminal((closedTerminal) => {
            //delete this.terminals[t];    TODO: Fix clean up of dict, if not shared
        });
    }
    addTerminal(shared, vfsid) {
        this.vfsid = vfsid;
        this.lastTerminalIsShared = shared;
        let title = "Cloud9 Terminal";
        if (shared) {
            title = "Cloud9 Terminal (shared)";
        }
        this.lastCreatedTerminal = vscode.window.createTerminalRenderer(title);
        this.lastTid = Math.floor(900 * Math.random()) + 100;
        this.eventEmitter.emit('send_ch4_message', ["tmux", "", { "cwd": "/home/ec2-user/environment", "cols": 125, "rows": 33, "name": "xterm-color", "base": "/home/ec2-user/.c9", "attach": false, "session": "cloud9_terminal_" + this.lastTid, "output": false, "terminal": true, "detachOthers": true, "defaultEditor": false, "encoding": "utf8", "command": "bash -l" }, { "$": 90 }]);
        if (shared) {
            this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_create", "tid": this.lastTid, "sender": this.vfsid } }]]);
        }
        console.log("init'd remote terminal");
    }
    closeTerminal(terminal) {
        terminal.terminal.dispose();
        if (terminal['shared']) {
            this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_destroy", "tid": terminal['tid'], "sender": this.vfsid } }]]);
        }
    }
    closeAll() {
        Object.values(this.terminals).forEach(terminal => {
            this.closeTerminal(terminal);
        });
    }
    emitTerminalData(terminal, data) {
        if (typeof data == "string") {
            terminal['terminal'].write(data);
            if (terminal['shared']) {
                /// 4{"ack":20042,"seq":10051,"d":["onData",10,"{\"type\":\"MESSAGE\",\"data\":{\"source\":\"9c0r243bg2MEXXXX\",\"target\":\"9cmXSwNs63hEXXXX\",\"action\":\"listOpenFiles\",\"docId\":\"\"},\"command\":\"vfs-collab\"}"]}
                this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_data", "data": data, "tid": terminal['tid'], "sender": this.vfsid } }]]);
            }
        }
    }
}
exports.TerminalManager = TerminalManager;
