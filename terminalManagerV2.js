"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var TerminalManager = /** @class */ (function () {
    function TerminalManager(eventEmitter) {
        var _this = this;
        this.eventEmitter = eventEmitter;
        this.terminals = {};
        eventEmitter.on('terminal_process_created', function (pty) {
            _this.terminals[pty["id"]] = {
                "terminal": _this.lastCreatedTerminal,
                "pid": parseInt(pty["pid"]),
                "tid": _this.lastTid,
                "shared": _this.lastTerminalIsShared
            };
            _this.lastCreatedTerminal.onDidAcceptInput(function (data) {
                _this.eventEmitter.emit('send_ch4_message', ["write", pty["id"], data.toString()]);
                if (_this.lastTerminalIsShared) {
                    _this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [_this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_udata", "tid": pty["id"], "data": data.toString() } }]]);
                }
            });
            _this.lastCreatedTerminal.terminal.show();
            _this.eventEmitter.emit('send_ch4_message', ["resize", pty["pid"], 159, 33]);
            _this.eventEmitter.emit('send_ch4_message', ["tmux", "", { "capturePane": { "start": -32768, "end": 1000, "pane": "cloud9_terminal_" + _this.lastTid + ":0.0" }, "encoding": "utf8", "name": "xterm-color", "command": "" }, { "$": pty["id"] }]);
        });
        eventEmitter.on('ch4_data', function (data, environmentId) {
            if (Array.isArray(data)) {
                if (data.length > 2) {
                    if (data[0] == "onEnd") {
                        if (Object.keys(_this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Terminating terminal");
                            _this.closeTerminal(_this.terminals[data[1]]);
                            delete _this.terminals[data[1]];
                        }
                    }
                    else if (data[0] == "onData") {
                        if (Object.keys(_this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Emitting terminal data");
                            _this.emitTerminalData(_this.terminals[data[1]], data[2]);
                        }
                    }
                    else if (data[0] == 90) { // terminal creation channel
                        var contents = data[2];
                        console.log("Terminal Process Created");
                        eventEmitter.emit('terminal_process_created', contents["pty"]);
                    }
                }
            }
        });
        vscode.window.onDidCloseTerminal(function (closedTerminal) {
            //delete this.terminals[t];    TODO: Fix clean up of dict
        });
    }
    TerminalManager.prototype.addTerminal = function (shared, vfsid) {
        this.vfsid = vfsid;
        this.lastTerminalIsShared = shared;
        var title = "Cloud9 Terminal";
        if (shared) {
            title = "Cloud9 Terminal (shared)";
        }
        this.lastCreatedTerminal = vscode.window.createTerminalRenderer(title);
        this.lastTid = Math.floor(900 * Math.random()) + 100;
        this.eventEmitter.emit('send_ch4_message', ["tmux", "", { "cwd": "/home/ec2-user/environment", "cols": 125, "rows": 33, "name": "xterm-color", "base": "/home/ec2-user/.c9", "attach": false, "session": "cloud9_terminal_" + this.lastTid, "output": false, "terminal": true, "detachOthers": true, "defaultEditor": false, "encoding": "utf8", "command": "bash -l" }, { "$": 90 }]);
        if (shared) {
            this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_create", "tid": this.lastTid } }]]);
        }
        console.log("init'd remote terminal");
    };
    TerminalManager.prototype.closeTerminal = function (terminal) {
        terminal.terminal.dispose();
        if (terminal['shared']) {
            this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_destroy", "tid": terminal['tid'] } }]]);
        }
    };
    TerminalManager.prototype.emitTerminalData = function (terminal, data) {
        if (typeof data == "string") {
            terminal['terminal'].write(data);
        }
        if (terminal['shared']) {
            this.eventEmitter.emit('send_ch4_message', ["call", "collab", "send", [this.vfsid, { "type": "GENERIC_BROADCAST", "data": { "exttype": "terminal_sdata", "tid": terminal['tid'] } }]]);
        }
    };
    return TerminalManager;
}());
exports.TerminalManager = TerminalManager;
