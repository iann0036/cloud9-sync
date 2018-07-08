import * as vscode from 'vscode';
import * as net from 'net';

export class TerminalManager {
    private terminals;
    private lastSocket;
    private lastTid;
    private lastCreatedTerminal;

    constructor(
        private extensionPath: string,
        private eventEmitter
    ) {
        this.terminals = {};
        eventEmitter.on('terminal_process_created', (pty) => {
            console.log("TERMINAL PROCESS DATA");
            console.log(pty);
            console.log(this.lastSocket);
            this.terminals[pty["id"]] = {
                "terminal": this.lastCreatedTerminal,
                "pid": parseInt(pty["pid"]),
                "tid": this.lastTid,
                "socket": this.lastSocket
            };
            
            this.eventEmitter.emit('send_ch4_message',
                ["resize",pty["pid"],159,33]
            );
            this.eventEmitter.emit('send_ch4_message',
                ["tmux","",{"capturePane":{"start":-32768,"end":1000,"pane":"cloud9_terminal_" + this.lastTid + ":0.0"},"encoding":"utf8","name":"xterm-color","command":""},{"$":pty["id"]}]
            );
        });

        eventEmitter.on('ch4_data', (data, environmentId) => {
            if (Array.isArray(data)) {
                if (data.length>2) {
                    if (data[0] == "onEnd") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Terminating terminal");
                            this.closeTerminal(this.terminals[data[1]]);
                            this.terminals.splice(data[1], 1);
                        }
                    } else if (data[0] == "onData") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Emitting terminal data");
                            this.emitTerminalData(this.terminals[data[1]], data[2]);
                        }
                    } else if (data[0] == 90) { // terminal creation channel
                        let contents = data[2];
        
                        console.log("Terminal Process Created");
                        eventEmitter.emit('terminal_process_created', contents["pty"]);
                    }
                }
            }
        });

        vscode.window.onDidCloseTerminal((closedTerminal) => {
            closedTerminal.processId.then((closedTerminalPid) => {
                for (var t in this.terminals) {
                    this.terminals[t]['terminal'].processId.then((pid) => {
                        if (pid == closedTerminalPid) {
                            delete this.terminals[t];
                        }
                    });
                }
            });
        });
    }

    addTerminal(): void {
        let terminalPath = this.getTerminalPath();

        if (terminalPath == null) {
            vscode.window.showErrorMessage("Unsupported platform for terminal");
            return;
        }
    
        const server = net.createServer((socket) => {
            this.lastSocket = socket;
            console.log("SOCKET OBTAINED");
    
            socket.on('end', () => {
                console.log('socket closed');
            });
            socket.on('data', (data) => {
                let correctTerminalId = null;
                
                for (var t in this.terminals) {
                    if (this.terminals[t]['socket'] === socket) {
                        correctTerminalId = t;
                    }
                }

                if (correctTerminalId == null) {
                    console.warn("Missing terminal socket");
                    return;
                }

                this.eventEmitter.emit('send_ch4_message',
                    ["write", correctTerminalId.toString(), data.toString()]
                ); // TODO: Fix
            });
    
            this.lastTid = Math.floor(900*Math.random()) + 100;
    
            this.eventEmitter.emit('send_ch4_message',
                ["tmux","",{"cwd":"/home/ec2-user/environment","cols":125,"rows":33,"name":"xterm-color","base":"/home/ec2-user/.c9","attach":false,"session":"cloud9_terminal_" + this.lastTid,"output":false,"terminal":true,"detachOthers":true,"defaultEditor":false,"encoding":"utf8","command":"bash -l"},{"$":90}]
            );
    
            console.log("init'd remote terminal");
        }).on('error', (err) => {
            console.error(err);
        });
        
        server.listen({
            host: 'localhost',
            port: 0, // ephemeral
            exclusive: true
        }, () => {
            let addr = server.address()
            console.log('opened server on', addr);
            if (process.platform == "win32") {
                this.lastCreatedTerminal = vscode.window.createTerminal("Cloud9 Terminal", this.extensionPath + "/terminalApp/ansicon/" + process.arch + "/ansicon.exe", [ terminalPath, addr['address'] + ":" + addr['port'] ]);
            } else {
                this.lastCreatedTerminal = vscode.window.createTerminal("Cloud9 Terminal", terminalPath, [ addr['address'] + ":" + addr['port'] ]);
            }
            this.lastCreatedTerminal.show();
        });
    }

    getTerminalPath() {
        let terminalPath = this.extensionPath + '/terminalApp/terminal-';
        
        if (process.arch == "x64" && process.platform == "darwin") {
            return terminalPath + "darwin-amd64";
        /*} else if (process.arch == "x32" && process.platform == "win32") {
            return terminalPath + "windows-386.exe";
        } else if (process.arch == "x64" && process.platform == "win32") {
            return terminalPath + "windows-amd64.exe";*/
        } else if (process.arch == "x32" && process.platform == "linux") {
            return terminalPath + "linux-386";
        } else if (process.arch == "x64" && process.platform == "linux") {
            return terminalPath + "linux-amd64";
        }
    
        return null;
    }

    closeTerminal(terminal) {
        terminal['socket'].destroy();
    }

    emitTerminalData(terminal, data) {
        if (typeof data == "string") {
            terminal['socket'].write(data);
        }
    }
}
