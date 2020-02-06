import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as Utils from './utils';
import { EventEmitter } from 'events';
import * as HttpsProxyAgent from 'https-proxy-agent';
import * as Url from 'url';

export class WebsocketProvider {
    private sessionState;
    private awsregion;
    private ws;
    private ch2_interval;
    private connect_interval;
    private ping_interval;
    private last_seq;
    private my_seq;
    private vfsid;
    private last_unacknowledged_edit;
    private activeEnvironmentInfo;
    private event_id;

    constructor(
        private eventEmitter
    ) {
        this.sessionState = "NOT_CONNECTED";
        this.awsregion = Utils.GetRegion();
        this.event_id = 1;
    }

    next_event_id(): number {
        this.event_id += 1;

        return this.event_id;
    }

    disconnect(): void {
        clearInterval(this.ch2_interval);
        clearInterval(this.ping_interval);
        clearInterval(this.connect_interval);

        if (this.ws) {
            this.ws.terminate();
        }

        this.sessionState = "NOT_CONNECTED";
    }

    connect(vfsid, xauth, sid, cookieJar, environmentId, activeEnvironmentInfo): void {
        this.sessionState = "CONNECTING";
        this.last_seq = 10001;
        this.my_seq = 20002;
        this.vfsid = vfsid;
        this.activeEnvironmentInfo = activeEnvironmentInfo;

        console.log("Declaring websocket");

        let cookiestr = cookieJar.getCookieString('https://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + environmentId);
    
        try {
            console.log('wss://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + environmentId + '/'+vfsid+'/socket/?authorization='+xauth+'&EIO=3&transport=websocket&sid='+sid);

            let proxy = Utils.GetProxy();
            let agent;
            if (proxy) {
                agent = new HttpsProxyAgent(proxy);
            } else {
                agent = null;
            }

            this.ws = new WebSocket(
                'wss://vfs.cloud9.' + this.awsregion + '.amazonaws.com/vfs/' + environmentId + '/'+vfsid+'/socket/?authorization='+xauth+'&EIO=3&transport=websocket&sid='+sid,
                [],
                {
                    'agent': agent,
                    'headers': {
                        'Cookie': cookiestr
                    },
                    'keepAlive': {
                        'enable': true,
                        'initialDelay': 60000
                    }
                }
            );
            
            this.ws.addEventListener('open', () => {
                console.log("WebSocket opened");
                this.ws.send('2probe');

                this.ch2_interval = setInterval(() => {
                    this.ws.send("2");
                }, 25000);
            });
            
            this.ws.addEventListener('message', (data) => {
                console.log("---GOT MESSAGE---");
                console.log(data.data);
                let messageType = parseInt(data.data[0]);
                if (data.data == "3probe") {
                    this.ws.send("5");
                    this.init();
                } else if (messageType == 4) {
                    let message = JSON.parse(data.data.substring(1));
                    if ('ack' in message) {
                        this.eventEmitter.emit('ack', message['ack']);
                    }
                    if ('seq' in message) {
                        this.last_seq = message['seq'];
                        this.ws.send("4" + JSON.stringify({
                            "ack": this.last_seq
                        }));
                        this.eventEmitter.emit('ch4_data', message['d'], environmentId);
                    }
                }
            });
            
            this.ws.addEventListener('error', (data) => {
                vscode.window.showErrorMessage("Error connecting with AWS Cloud9 environment");
                console.warn("---ERROR---");
                console.log(data);
            });
    
            this.ws.addEventListener('close', () => {
                vscode.window.showWarningMessage("Disconnected from AWS Cloud9 environment");
                console.warn('---DISCONNECTED---');
                this.eventEmitter.emit('disconnect');
            });
        } catch(error) {
            console.log(error);
            vscode.window.showWarningMessage("There was an error connecting to the AWS Cloud9 environment");
            this.eventEmitter.emit('disconnect');
        }
    }

    init() {
        console.warn("Retrieving active environment info");
        console.log(this.activeEnvironmentInfo);
        console.log("Starting Websock Init");
        this.send_ch4_message(
            [1,["onData","onEnd","onClose","onError","write","end","destroy","resume","pause","onExit","onProcessClose","onPtyKill","onChange","onEvent","vfsDying"],false]
        );
        this.send_ch4_message(
            ["execFile","node",{"args":["-e","log(Date.now())"],"encoding":"utf8"},{"$": this.next_event_id()}]
        );
        this.send_ch4_message(
            ["stat", "/.c9/builders", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["stat", this.activeEnvironmentInfo.installPath + "/bin/.c9gdbshim2", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["watch", this.activeEnvironmentInfo.environmentDir, {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["watch", "/.c9/project.settings", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["watch", "/", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["execFile","sudo",{"args":["chown",this.activeEnvironmentInfo.project.remote.loginName,"-R","/usr/local/rvm/gems"],"encoding":"utf8"},{"$":this.next_event_id()}]
        );
        this.send_ch4_message(
            ["stat", "/.eslintrc", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["execFile", "bash", {args: ["-c", "echo $C9_HOSTNAME"]}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["extend", "ping", {file: "c9.vfs.client/ping-service.js"}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["execFile", "bash", {args: ["-c", "echo $C9_HOSTNAME"]}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["extend", "ping", {file: "c9.vfs.client/ping-service.js"}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["extend", "collab", {file: "c9.ide.collab/server/collab-server.js"}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["spawn",this.activeEnvironmentInfo.homeDir + "/.c9/node/bin/node",{"args":[this.activeEnvironmentInfo.homeDir + "/.c9/node_modules/.bin/nak","--json","{\"pathToNakignore\":\"" + this.activeEnvironmentInfo.environmentDir + "/.c9/.nakignore\",\"ignoreCase\":true,\"literal\":true,\"pathInclude\":\"*.yml, *.yaml, *.json\",\"query\":\"AWS::Serverless\",\"path\":\"" + this.activeEnvironmentInfo.environmentDir + "/\",\"follow\":true,\"limit\":100000}"],"stdoutEncoding":"utf8","stderrEncoding":"utf8","stdinEncoding":"utf8"},{"$": this.next_event_id()}]
        );
        this.send_ch4_message(
            ["spawn",this.activeEnvironmentInfo.homeDir + "/.c9/node/bin/node",{"args":[this.activeEnvironmentInfo.homeDir + "/.c9/node_modules/.bin/nak","--json","{\"pathToNakignore\":\"" + this.activeEnvironmentInfo.environmentDir + "/.c9/.nakignore\",\"ignoreCase\":true,\"literal\":true,\"pathInclude\":\"*.yml, *.yaml, *.json\",\"query\":\"AWS::Serverless\",\"path\":\"" + this.activeEnvironmentInfo.environmentDir + "/\",\"follow\":true,\"limit\":100000}"],"stdoutEncoding":"utf8","stderrEncoding":"utf8","stdinEncoding":"utf8"},{"$": this.next_event_id()}]
        );
        this.send_ch4_message(
            ["call","jsonalyzer_server","init",[{"environmentDir":this.activeEnvironmentInfo.environmentDir,"homeDir":this.activeEnvironmentInfo.homeDir,"packagePath":"plugins/c9.ide.language.jsonalyzer/jsonalyzer","useCollab":true,"useSend":false,"maxServerCallInterval":2000,"provides":["jsonalyzer"],"consumes":["Plugin","commands","language","c9","watcher","save","language.complete","dialog.error","ext","collab","collab.connect","language.worker_util_helper","error_handler","installer"]},{"$": this.next_event_id()}]]
        );
        this.send_ch4_message(
            ["call", "bridge", "connect", [{$: this.next_event_id()}]]
        );
        this.send_ch4_message(
            ["call","jsonalyzer_server","init",[{"environmentDir":this.activeEnvironmentInfo.environmentDir,"homeDir":this.activeEnvironmentInfo.homeDir,"packagePath":"plugins/c9.ide.language.jsonalyzer/jsonalyzer","useCollab":true,"useSend":false,"maxServerCallInterval":2000,"provides":["jsonalyzer"],"consumes":["Plugin","commands","language","c9","watcher","save","language.complete","dialog.error","ext","collab","collab.connect","language.worker_util_helper","error_handler","installer"]},{"$": this.next_event_id()}]]
        );
        /*this.send_ch4_message(
            ["stat", "/2", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["watch", "/deep/folder", {}, {$: this.next_event_id()}]
        );
        this.send_ch4_message(
            ["watch", "/deep", {}, {$: this.next_event_id()}]
        );*/
        this.send_ch4_message(
            ["call","jsonalyzer_server","init",[{"environmentDir":this.activeEnvironmentInfo.environmentDir,"homeDir":this.activeEnvironmentInfo.homeDir,"packagePath":"plugins/c9.ide.language.jsonalyzer/jsonalyzer","useCollab":true,"useSend":false,"maxServerCallInterval":2000,"provides":["jsonalyzer"],"consumes":["Plugin","commands","language","c9","watcher","save","language.complete","dialog.error","ext","collab","collab.connect","language.worker_util_helper","error_handler","installer"]},{"$": this.next_event_id()}]]
        );
        this.send_ch4_message(
            ["stat", "/", {}, {$: this.next_event_id()}]
        );
        this.connect_interval = setInterval(() => {
            this.send_ch4_message(
                ["call","collab","connect",[{"basePath":this.activeEnvironmentInfo.environmentDir,"clientId":this.vfsid},{"$": this.next_event_id()}]]
            );
        }, 3000);
    }

    postconnect() {
        console.log("POST CONNECT WEBSOCK INIT");
        clearInterval(this.connect_interval);
        this.ping_interval = setInterval(() => {
            this.send_ch4_message(
                ["call","ping","ping",["serverTime",{"$": this.next_event_id()}]]
            );
        }, 10000);
        this.send_ch4_message(
            ["call", "ping", "ping", ["serverTime", {"$":  this.next_event_id()}]]
        );
        this.send_ch4_message(
            ["extend", "collab", {"file": "c9.ide.collab/server/collab-server.js"}, {"$": this.next_event_id()}]
        );

        this.eventEmitter.emit('websocket_init_complete');
        this.sessionState = "CONNECTED";
    }

    send_ch4_message(data): Number {
        let seq = this.my_seq;
        this.my_seq += 1;
    
        let msg = {
            'ack': this.last_seq,
            'seq': seq,
            'd': data
        }
        console.log("Sending:");
        console.log('4' + JSON.stringify(msg));
        this.ws.send('4' + JSON.stringify(msg));
    
        return seq;
    }
}
