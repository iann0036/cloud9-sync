import * as vscode from 'vscode';

export class TerminalManager {
    private terminals;
    private lastTid;
    private lastCreatedTerminal;
    private lastTerminalIsShared;
    private vfsid;
    private terminal_creation_channels;

    constructor(
        private eventEmitter,
        private websocketProvider
    ) {
        this.terminals = {};
        this.terminal_creation_channels = [];
        eventEmitter.on('terminal_process_created', (pty) => {

            if (!this.lastCreatedTerminal) { return; } // terminal already registered

            this.terminals[pty["id"]] = {
                "terminal": this.lastCreatedTerminal.terminal,
                "writeEmitter": this.lastCreatedTerminal.writeEmitter,
                "pid": parseInt(pty["pid"]),
                "tid": this.lastTid,
                "shared": this.lastTerminalIsShared,
                "owner": this.vfsid
            };
            this.lastCreatedTerminal.terminal.show();
            this.lastCreatedTerminal = null;
            
            this.eventEmitter.emit('send_ch4_message',
                ["resize",pty["pid"],159,33]
            );
            this.eventEmitter.emit('send_ch4_message',
                ["tmux","",{"capturePane":{"start":-32768,"end":1000,"pane":"cloud9_terminal_" + this.lastTid + ":0.0"},"encoding":"utf8","name":"xterm-color","command":""},{"$":pty["id"]}]
            );
            /*if (!this.lastTerminalIsShared) {
                this.eventEmitter.emit('send_ch4_message', // detach other clients if not shared
                    ["write", pty["id"], ":detach -a\n"]
                );
            }*/
        });

        eventEmitter.on('ch4_data', (data, environmentId) => {
            if (Array.isArray(data)) {
                if (data.length>2) {
                    if (data[0] == "onEnd") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Terminating terminal");
                            //this.closeTerminal(this.terminals[data[1]]);
                            //delete this.terminals[data[1]];
                        }
                    } else if (data[0] == "onData") {
                        if (Object.keys(this.terminals).map(Number).indexOf(data[1]) != -1) {
                            console.log("Emitting terminal data");
                            this.emitTerminalData(this.terminals[data[1]], data[2]);
                        }
                        try {
                            let xd = JSON.parse(data[2]);
                            if (xd['type'] == "GENERIC_BROADCAST" && xd['data']['sender'] != this.vfsid) {
                                if (xd['data']['exttype'] == 'terminal_create') {
                                    const writeEmitter = new vscode.EventEmitter<string>();
                                    const vspty: vscode.Pseudoterminal = {
                                        onDidWrite: writeEmitter.event,
                                        open: () => {
                                            console.log("init'd remote shared terminal");
                                        },
                                        close: () => {},
                                        handleInput: data => {
                                            this.eventEmitter.emit('send_ch4_message',
                                                ["write", data[1], data.toString()]
                                            );
                                        }
                                    };
                                    this.lastCreatedTerminal = {
                                        'terminal': vscode.window.createTerminal({ name: 'Cloud9 Terminal (shared)', pty: vspty }),
                                        'writeEmitter': writeEmitter
                                    };
                                    
                                    this.terminals['shared_' + xd['data']['tid']] = {
                                        "terminal": this.lastCreatedTerminal['terminal'],
                                        "writeEmitter": writeEmitter,
                                        "pid": null,
                                        "tid": xd['data']['tid'],
                                        "shared": true,
                                        "owner": xd['data']['sender']
                                    };
                                    this.lastCreatedTerminal['terminal'].show();
                                } else if (xd['data']['exttype'] == 'terminal_data') {
                                    if ('shared_' + xd['data']['tid'] in this.terminals) {
                                        //this.terminals['shared_' + xd['data']['tid']]['writeEmitter'].fire(xd['data']['data']);
                                    }
                                } else if (xd['data']['exttype'] == 'terminal_destroy') {
                                    if ('shared_' + xd['data']['tid'] in this.terminals) {
                                        this.terminals['shared_' + xd['data']['tid']]['terminal'].terminal.dispose();
                                    }
                                }
                            }
                        } catch(err) {}
                    } else if (this.terminal_creation_channels.includes(data[0])) { // terminal creation channels
                        let contents = data[2];

                        eventEmitter.emit('terminal_process_created', contents["pty"]);
                    }
                }
            }
        });

        vscode.window.onDidCloseTerminal((closedTerminal) => {
            //delete this.terminals[t];    TODO: Fix clean up of dict, if not shared
        });
    }

    addTerminal(shared: boolean, vfsid: string, activeEnvironmentInfo: any): void {
        this.vfsid = vfsid;
        this.lastTerminalIsShared = shared;

        let title = "Cloud9 Terminal";
        if (shared) {
            title = "Cloud9 Terminal (shared)";
        }
        let event_id = this.websocketProvider.next_event_id();
        this.terminal_creation_channels.push(event_id);

        const writeEmitter = new vscode.EventEmitter<string>();
        let vspty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            open: () => {
                this.lastTid = Math.floor(900*Math.random()) + 100;

                this.eventEmitter.emit('send_ch4_message',
                    ["tmux","",{"cwd":activeEnvironmentInfo.environmentDir,"cols":125,"rows":33,"name":"xterm-color","base":activeEnvironmentInfo.homeDir + "/.c9","attach":false,"session":"cloud9_terminal_" + this.lastTid,"output":false,"terminal":true,"detachOthers":false,"defaultEditor":false,"encoding":"utf8","command":"bash -l"},{"$": event_id}]
                );

                if (shared) {
                    this.eventEmitter.emit('send_ch4_message',
                        ["call","collab","send",[this.vfsid,{"type":"GENERIC_BROADCAST","data":{"exttype":"terminal_create","tid":this.lastTid,"sender":this.vfsid}}]]
                    );
                }

                console.log("init'd remote terminal");
            },
            close: () => {},
            handleInput: data => {
                for (let [tkey, terminal] of Object.entries(this.terminals)) {
                    if (terminal["writeEmitter"] === writeEmitter) {
                        this.eventEmitter.emit('send_ch4_message',
                            ["write", tkey, data.toString()]
                        );
                    }
                }
            }
        };
        this.lastCreatedTerminal = {
            'terminal': vscode.window.createTerminal({ name: title, pty: vspty }),
            'writeEmitter': writeEmitter
        };

        this.lastTid = Math.floor(900*Math.random()) + 100;

        this.eventEmitter.emit('send_ch4_message',
            ["tmux","",{"cwd":activeEnvironmentInfo.environmentDir,"cols":125,"rows":33,"name":"xterm-color","base":activeEnvironmentInfo.homeDir + "/.c9","attach":false,"session":"cloud9_terminal_" + this.lastTid,"output":false,"terminal":true,"detachOthers":false,"defaultEditor":false,"encoding":"utf8","command":"bash -l"},{"$": event_id}]
        );
    }

    closeTerminal(terminal): void {
        terminal.terminal.dispose();

        if (terminal['shared']) {
            this.eventEmitter.emit('send_ch4_message',
                ["call","collab","send",[this.vfsid,{"type":"GENERIC_BROADCAST","data":{"exttype":"terminal_destroy","tid":terminal['tid'],"sender":this.vfsid}}]]
            );
        }
    }

    closeAll(): void {
        Object.values(this.terminals).forEach(terminal => {
            this.closeTerminal(terminal);
        });
    }

    emitTerminalData(terminal, data): void {
        if (typeof data == "string") {
            terminal['writeEmitter'].fire(data);

            if (terminal['shared']) {
                /// 4{"ack":20042,"seq":10051,"d":["onData",10,"{\"type\":\"MESSAGE\",\"data\":{\"source\":\"9c0r243bg2MEXXXX\",\"target\":\"9cmXSwNs63hEXXXX\",\"action\":\"listOpenFiles\",\"docId\":\"\"},\"command\":\"vfs-collab\"}"]}
                this.eventEmitter.emit('send_ch4_message',
                    ["call","collab","send",[this.vfsid,{"type":"GENERIC_BROADCAST","data":{"exttype":"terminal_data","data":data,"tid":terminal['tid'],"sender":this.vfsid}}]]
                );
            }
        }
    }
}
