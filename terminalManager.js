"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var net = require("net");
var TerminalManager = /** @class */ (function () {
    function TerminalManager(extensionPath, eventEmitter) {
        var _this = this;
        this.extensionPath = extensionPath;
        this.eventEmitter = eventEmitter;
        this.terminals = {};
        eventEmitter.on('terminal_process_created', function (pty) {
            console.log("TERMINAL PROCESS DATA");
            console.log(pty);
            console.log(_this.lastSocket);
            _this.terminals[pty["id"]] = {
                "terminal": _this.lastCreatedTerminal,
                "pid": parseInt(pty["pid"]),
                "tid": _this.lastTid,
                "socket": _this.lastSocket
            };
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
                            _this.terminals.splice(data[1], 1);
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
            closedTerminal.processId.then(function (closedTerminalPid) {
                for (var t in _this.terminals) {
                    _this.terminals[t]['terminal'].processId.then(function (pid) {
                        if (pid == closedTerminalPid) {
                            delete _this.terminals[t];
                        }
                    });
                }
            });
        });
    }
    TerminalManager.prototype.addTerminal = function (shared, vfsid) {
        var _this = this;
        var terminalPath = this.getTerminalPath();
        this.vfsid = vfsid;
        if (terminalPath == null) {
            vscode.window.showErrorMessage("Unsupported platform for terminal");
            return;
        }
        if (shared) {
            vscode.window.showInformationMessage("Shared terminal requires Visual Studio Code 1.26.0 or greater");
        }
        var server = net.createServer(function (socket) {
            _this.lastSocket = socket;
            console.log("SOCKET OBTAINED");
            socket.on('end', function () {
                console.log('socket closed');
            });
            socket.on('data', function (data) {
                var correctTerminalId = null;
                for (var t in _this.terminals) {
                    if (_this.terminals[t]['socket'] === socket) {
                        correctTerminalId = t;
                    }
                }
                if (correctTerminalId == null) {
                    console.warn("Missing terminal socket");
                    return;
                }
                _this.eventEmitter.emit('send_ch4_message', ["write", correctTerminalId.toString(), data.toString()]); // TODO: Fix
            });
            _this.lastTid = Math.floor(900 * Math.random()) + 100;
            _this.eventEmitter.emit('send_ch4_message', ["tmux", "", { "cwd": "/home/ec2-user/environment", "cols": 125, "rows": 33, "name": "xterm-color", "base": "/home/ec2-user/.c9", "attach": false, "session": "cloud9_terminal_" + _this.lastTid, "output": false, "terminal": true, "detachOthers": true, "defaultEditor": false, "encoding": "utf8", "command": "bash -l" }, { "$": 90 }]);
            console.log("init'd remote terminal");
        }).on('error', function (err) {
            console.error(err);
        });
        server.listen({
            host: 'localhost',
            port: 0,
            exclusive: true
        }, function () {
            var addr = server.address();
            var title = "Cloud9 Terminal";
            console.log('opened server on', addr);
            if (process.platform == "win32") {
                _this.lastCreatedTerminal = vscode.window.createTerminal(title, _this.extensionPath + "/terminalApp/ansicon/" + process.arch + "/ansicon.exe", [terminalPath, addr['address'] + ":" + addr['port']]);
            }
            else {
                _this.lastCreatedTerminal = vscode.window.createTerminal(title, terminalPath, [addr['address'] + ":" + addr['port']]);
            }
            _this.lastCreatedTerminal.show();
        });
    };
    TerminalManager.prototype.getTerminalPath = function () {
        var terminalPath = this.extensionPath + '/terminalApp/terminal-';
        if (process.arch == "x64" && process.platform == "darwin") {
            return terminalPath + "darwin-amd64";
            /*} else if (process.arch == "x32" && process.platform == "win32") {
                return terminalPath + "windows-386.exe";
            } else if (process.arch == "x64" && process.platform == "win32") {
                return terminalPath + "windows-amd64.exe";*/
        }
        else if (process.arch == "x32" && process.platform == "linux") {
            return terminalPath + "linux-386";
        }
        else if (process.arch == "x64" && process.platform == "linux") {
            return terminalPath + "linux-amd64";
        }
        return null;
    };
    TerminalManager.prototype.closeTerminal = function (terminal) {
        terminal['socket'].destroy();
    };
    TerminalManager.prototype.emitTerminalData = function (terminal, data) {
        if (typeof data == "string") {
            terminal['socket'].write(data);
        }
    };
    return TerminalManager;
}());
exports.TerminalManager = TerminalManager;
