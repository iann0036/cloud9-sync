const vscode = require('vscode');
const request = require('request');
const aws4 = require('aws4');
const path = require('path');
const RenderManager = require("./renderManager");
const cookie = require('cookie');
const ViewProviders = require("./viewProviders");
const Utils = require("./utils");
const UserManager = require("./userManager");
const TerminalManager = require("./terminalManager");
const WebsocketProvider = require("./websocketProvider");
const FileManager = require("./fileManager");
const EditManager = require("./editManager");
const events = require('events');

let cookieJar, xauth, vfsid, watcher, clients, awsregion;
let connectedEnvironment;
let activationInterval, extensionConfig;
let activationIntervalMaxTries, visibleDocuments;
let join_doc_chunks = [], statusBarItem;

let userProvider, environmentProvider, environmentView, userManager;
let terminalManager, eventEmitter, websocketProvider, fileManager, editManager;

let p, connectionPromise;

function activate(context) {
    console.log('"cloud9-sync" is active');

    eventEmitter = new events.EventEmitter();
    setEventEmitterEvents();

    userProvider = new ViewProviders.UserProvider(vscode.workspace.rootPath);
    environmentProvider = new ViewProviders.EnvironmentProvider(vscode.workspace.rootPath);
    chatProvider = new ViewProviders.ChatProvider(vscode.workspace.rootPath);
    terminalManager = new TerminalManager.TerminalManager(context.extensionPath, eventEmitter);
    websocketProvider = new WebsocketProvider.WebsocketProvider(eventEmitter);
    fileManager = new FileManager.FileManager(eventEmitter);
    editManager = new EditManager.EditManager(eventEmitter, websocketProvider);

    vscode.window.createTreeView('live-share-for-aws-cloud9-view-2-users', {
        'treeDataProvider': userProvider
    });
    environmentView = vscode.window.createTreeView('live-share-for-aws-cloud9-view-1-environments', {
        'treeDataProvider': environmentProvider
    });
    vscode.window.createTreeView('live-share-for-aws-cloud9-view-3-chat', {
        'treeDataProvider': chatProvider
    });

    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.setup', commandSetup));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.connect', commandConnect));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.disconnect', commandDisconnect));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.resync', commandResync));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.refreshenvironments', commandRefreshenvironments));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.initterminal', commandInitterminal));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.sendchat', commandSendchat));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.syncupfsitem', commandSyncupfsitem));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.addenvironment', commandAddenvironment));

    refreshEnvironmentsInSidebar();
}
exports.activate = activate;

function deactivate() {
    console.log('"cloud9-sync" has been deactivated')
}
exports.deactivate = deactivate;

function commandSyncupfsitem(ctx) {
    fileManager.recursiveUpload(ctx.fsPath);
}

function commandAddenvironment() {
    vscode.window.showInputBox({
        placeHolder: "",
        prompt: "Environment name.",
        value: "",
        ignoreFocusOut: true
    }).then(function(env_name){
        if (env_name && env_name.length > 0) {
            extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
            awsregion = extensionConfig.get('region');

            let idemToken = Math.floor(Math.random() * 9999999999).toString();

            let awsreq = aws4.sign({
                service: 'cloud9',
                region: awsregion,
                method: 'POST',
                path: '/',
                headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.CreateEnvironmentEC2'
                },
                body: JSON.stringify({
                    "automaticStopTimeMinutes": 30,
                    "clientRequestToken": idemToken,
                    "description": "Environment created from VS Code",
                    "instanceType": "t2.micro",
                    //"ownerArn": "string",
                    //"subnetId": "string"
                    "name": env_name
                })
            },
            {
                secretAccessKey: extensionConfig.get('secretKey'),
                accessKeyId: extensionConfig.get('accessKey')
            });

            request.post({
                url: "https://" + awsreq.hostname + awsreq.path,
                headers: awsreq.headers,
                body: awsreq.body
            }, function(err, httpResponse, env_token) {
                let response = JSON.parse(httpResponse['body']);

                console.log(response);

                refreshEnvironmentsInSidebar();
            });
        }
    });
}

function commandSendchat() {
    vscode.window.showInputBox({
        placeHolder: "",
        prompt: "Chat message.",
        value: "",
        ignoreFocusOut: false
    }).then(function(message){
        if (message && message.length > 0) {
            websocketProvider.send_ch4_message([
                "call","collab","send",[vfsid,{"type":"CHAT_MESSAGE","data":{"text":message}}]
            ]);
        }
    });
}
function commandInitterminal() {
    terminalManager.addTerminal();
}

function commandResync() {
    vscode.window.setStatusBarMessage('Resyncing...', 5000);
    do_sync().then(function(){
        vscode.window.setStatusBarMessage('Resync complete', 5000);
    }.catch(function(){
        vscode.window.setStatusBarMessage('Resync failed', 5000);
    }));
}

function commandConnect(ctx) {
    console.log(ctx);
    
    eventEmitter.emit('disconnect');

    //vscode.window.setStatusBarMessage('Connecting...', 10000);

    vscode.window.withProgress({
        //title: "Connection Status",
        location: vscode.ProgressLocation.Window
    }, (p_local) => new Promise((connectionPromise_local) => {

        p = p_local;
        connectionPromise = connectionPromise_local;

        p.report({message: "Checking Cloud9 environment status"});
        environmentProvider.getChildren().then(function(envs) {
            if (envs.length < 1) {
                vscode.window.showWarningMessage('No environments available to connect to');
                connectionPromise.resolve();
            } else {
                connectedEnvironment = envs[0];
                envs.forEach(env => {
                    if (ctx.id == env.id) {
                        connectedEnvironment = env;
                    }
                });
                console.log(environmentView.selection);
                connectedEnvironment.setConnecting();
                environmentProvider.refresh();
    
                checkEnvironmentStatus(connectedEnvironment['id']).then(function(status){
                    if (connectedEnvironment.state == "NOT_CONNECTED") {
                        commandDisconnect();
                        return;
                    }
                    console.log(status);
                    p.report({message: "Connecting to Cloud9 instance"});
                    
                    doConnect(connectedEnvironment['id']);
                }).catch(function(error){
                    console.log(error);
                    if (connectedEnvironment.state == "NOT_CONNECTED") {
                        commandDisconnect();
                        return;
                    }
                    p.report({message: "Turning on Cloud9 instance"});
                    let awsreq = aws4.sign({
                        service: 'cloud9',
                        region: awsregion,
                        method: 'POST',
                        path: '/',
                        headers: {
                          'Content-Type': 'application/x-amz-json-1.1',
                          'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.ActivateEC2Remote'
                        },
                        body: '{"environmentId":"' + connectedEnvironment['id'] + '"}'
                    },
                    {
                        secretAccessKey: extensionConfig.get('secretKey'),
                        accessKeyId: extensionConfig.get('accessKey')
                    });
                
                    request.post({
                        url: "https://" + awsreq.hostname + awsreq.path,
                        headers: awsreq.headers,
                        body: awsreq.body
                    }, function(err, httpResponse, env_token) {
                        if (connectedEnvironment.state == "NOT_CONNECTED") {
                            commandDisconnect();
                            return;
                        }
                        activationIntervalMaxTries = 60; // 3 mins
                        activationInterval = setInterval(function(){
                            if (connectedEnvironment.state == "NOT_CONNECTED") {
                                commandDisconnect();
                                return;
                            }
                            checkEnvironmentStatus(connectedEnvironment['id']).then(function(){
                                clearInterval(activationInterval);
                                p.report({message: "Cloud9 instance has come online, continuing to connect"});
                                doConnect(connectedEnvironment['id']);
                            }).catch(function(error){
                                console.log("Still not online...");
                                console.log(error);
                                activationIntervalMaxTries -= 1;
                                if (activationIntervalMaxTries < 1) {
                                    clearInterval(activationInterval);
                                    vscode.window.showWarningMessage("Failed to connect in reasonable time");
                                    commandDisconnect();
                                }
                            });
                            console.log("Checking online status...");
                        }, 3000);
                    });
                });
            }
        });
    }));
}

function commandDisconnect() {
    eventEmitter.emit('disconnect');
    p.report({message: ""}); // TODO: Replace me with connectionPromise.resolve()
}

function commandRefreshenvironments() {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    if (
        extensionConfig.get('accessKey') == "" ||
        extensionConfig.get('secretKey') == "" ||
        !extensionConfig.get('accessKey') ||
        !extensionConfig.get('secretKey')
    ) {
        vscode.window.setStatusBarMessage("Fill in your AWS credentials to begin", 5000);
        commandSetup();
        return;
    }

    vscode.window.setStatusBarMessage('Refreshing environments...', 5000);
    refreshEnvironmentsInSidebar();
}

function commandSetup() {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    let config = {};

    vscode.window.showInputBox({
        placeHolder: "AKIA...",
        prompt: "Your AWS access key for authenticating to the environment.",
        value: extensionConfig.inspect('accessKey').globalValue,
        ignoreFocusOut: true
    }).then(function(accessKeyResponse){
        config['accessKey'] = accessKeyResponse;

        if (!accessKeyResponse) return;

        return vscode.window.showInputBox({
            prompt: "Your AWS secret key for authenticating to the environment.",
            value: extensionConfig.inspect('secretKey').globalValue,
            ignoreFocusOut: true
        });
    }).then(function(secretKeyResponse){
        config['secretKey'] = secretKeyResponse;

        if (!secretKeyResponse) return;

        return vscode.window.showInputBox({
            placeHolder: "us-west-2",
            prompt: "Specifies the AWS Cloud9 region.",
            value: extensionConfig.inspect('region').globalValue,
            ignoreFocusOut: true
        });
    }).then(function(regionReponse){
        if (!regionReponse) return;

        extensionConfig.update("accessKey", config['accessKey'], vscode.ConfigurationTarget.Global);
        extensionConfig.update("secretKey", config['secretKey'], vscode.ConfigurationTarget.Global);
        extensionConfig.update("region", regionReponse, vscode.ConfigurationTarget.Global);

        vscode.window.setStatusBarMessage('Refreshing environments...', 5000);
        refreshEnvironmentsInSidebar();
    });
}

function setEventEmitterEvents() {
    eventEmitter.on('send_ch4_message', (data) => {
        websocketProvider.send_ch4_message(data);
    });

    eventEmitter.on('disconnect', () => {
        // TODO: connectionPromise.resolve()
        if (statusBarItem) {
            statusBarItem.hide();
        }
        userProvider.clearAll();
        environmentProvider.disconnectAll();
        chatProvider.clearAll();
        websocketProvider.disconnect();
    });

    eventEmitter.on('websocket_init_complete', () => {
        console.log("WebSocket Init Complete, doing JOIN_DOCs");
        visibleDocuments = [];
    
        vscode.window.visibleTextEditors.forEach(editor => {
            join_doc_chunks = [];
            websocketProvider.send_ch4_message(
                ["call","collab","send",[vfsid,{"type": "JOIN_DOC","data": {
                    "docId": Utils.ShortenFilePath(editor.document.fileName),
                    "reqId": Math.floor(9007199254740992*Math.random())
                }}]]
            );
            websocketProvider.send_ch4_message(
                ["watch", Utils.ShortenFilePath(editor.document.fileName), {}, {$: 10}]
            );
            visibleDocuments.push(editor.document.fileName);
        });
        console.log("Done JOIN_DOCs, doing TextEditorChangeSelection listener");
    
        vscode.window.onDidChangeTextEditorSelection(process_cursor_update);

        extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
        syncStrategy = extensionConfig.get('syncStrategy');

        p.report({message: "Synchronizing the environment"});

        function continueSync(sync_type) {
            console.log("Doing sync");
            console.log(sync_type);

            do_sync(sync_type).then(() => {
                p.report({message: ""}); // TODO: Replace me with connectionPromise.resolve()

                console.log("Creating watchers");
                createWatchers();
                console.log("Finished creating watchers");

                statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
                statusBarItem.text = '$(globe) Connected to the \'' + connectedEnvironment['name'] + '\' environment';
                statusBarItem.show();
            }).catch((err) => {
                p.report({message: ""}); // TODO: Replace me with connectionPromise.resolve()

                console.warn("Sync failed");
                console.log(err);
    
                vscode.window.showWarningMessage('Synchronization failed');

                statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
                statusBarItem.text = '$(globe) Connected to the \'' + connectedEnvironment['name'] + '\' environment';
                statusBarItem.show();
            });
        }
        
        if (syncStrategy == "prompt") {
            vscode.window.showInformationMessage("How would you like to sync?", "None", "Download Only", "Bi-directional").then((response) => {
                if (response == "None") {
                    extensionConfig.update("syncStrategy", "none", vscode.ConfigurationTarget.Workspace);
                    continueSync("none");
                } else if (response == "Download Only") {
                    extensionConfig.update("syncStrategy", "downloadonly", vscode.ConfigurationTarget.Workspace);
                    continueSync("downloadonly");
                } else if (response == "Bi-directional") {
                    extensionConfig.update("syncStrategy", "bidirectional", vscode.ConfigurationTarget.Workspace);
                    continueSync("bidirectional");
                }
            });
        } else {
            continueSync(syncStrategy);
        }
    });
    
    eventEmitter.on('USER_JOIN', (event_data) => {
        if (event_data["clientId"] == vfsid) return;
        console.log("USER JOIN " + event_data["clientId"]);
        //event_data["user"]["userId"]
        let client = new RenderManager.RenderManager(event_data["clientId"], event_data["user"]["name"], userManager, event_data["user"]["color"]);
        clients[event_data["clientId"]] = {
            client: client,
            userId: event_data["user"]["userId"],
            color: event_data["user"]["color"],
            name: event_data["user"]["name"],
            state: event_data["user"]["state"]
        };
        console.log(clients);
        vscode.window.setStatusBarMessage(event_data["user"]["name"] + ' has joined the workspace', 5000);
    });
    
    eventEmitter.on('USER_LEAVE', (event_data) => {
        if (event_data["clientId"] == vfsid) return;
        vscode.window.setStatusBarMessage(clients[event_data["clientId"]]["name"] + ' has left the workspace', 5000);
        clients[event_data["clientId"]]["client"].destroy();
        userManager.removeClient(event_data["clientId"]);
        clients.splice(event_data["clientId"], 1);
    });
    
    eventEmitter.on('CHAT_MESSAGE', (event_data) => {
        vscode.window.setStatusBarMessage(event_data.name + ': ' + event_data.text, 5000);
        chatProvider.addChatItem(event_data.id, event_data.userId, event_data.name, event_data.text, event_data.timestamp);
    });

    eventEmitter.on('CLEAR_CHAT', (event_data) => {
        chatProvider.clearAll();
    });
    
    eventEmitter.on('JOIN_DOC', (event_data) => {
        let chunk = event_data["chunk"];
        join_doc_chunks.push(chunk); // TODO: Make indexed
        if (event_data["chunksLength"] == event_data["chunkNum"]) {
            // Update open copy
            join_doc_response = JSON.parse(join_doc_chunks.join(""));
            join_doc_chunks = [];
    
            let inodePath = path.join(vscode.workspace.rootPath, "/" + event_data["docId"]);
    
            vscode.workspace.openTextDocument(inodePath).then((document) => {
                let edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(9999999999999999999999) // TODO: Fix hack
                    ),
                    join_doc_response['contents']
                )
                editManager.addRemoteEdit(edit);
                vscode.workspace.applyEdit(edit);
                
                editManager.lastKnownRemoteDocumentText[Utils.ShortenFilePath(inodePath)] = join_doc_response['contents'];
                editManager.lastKnownLocalDocumentText[Utils.ShortenFilePath(inodePath)] = join_doc_response['contents'];
                console.log("Initialized lastKnownTexts for doc: " + Utils.ShortenFilePath(inodePath));
                editManager.revNum = join_doc_response['revNum'];
    
                // Set Selections
    
                Object.values(join_doc_response['selections']).forEach(client => {
                    let internalclient = clients[client["clientId"]];
    
                    userManager.setPosition(client["clientId"], inodePath, document, {
                        start: new vscode.Position(client["selection"][0], client["selection"][1]),
                        end: new vscode.Position(client["selection"][2], client["selection"][3])
                    }, client["selection"][4]);
    
                    internalclient['client'].refresh();
                });
            });
        }
    });
    
    eventEmitter.on('SYNC_COMMIT', (event_data) => {
        // TODO: Reapply changes after SYNC_COMMIT
        //editManager.revNum = event_data["revNum"]; // not strictly needed anymore, as JOIN_DOC will override
        console.warn("SYNC COMMIT");
        join_doc_chunks = [];
        websocketProvider.send_ch4_message(
            ["call","collab","send",[vfsid,{"type": "JOIN_DOC","data": {
                "docId": event_data["docId"],
                "reqId": Math.floor(9007199254740992*Math.random())
            }}]]
        );
        websocketProvider.send_ch4_message(
            ["watch", event_data["docId"], {}, {$: 10}]
        );
    });
    
    eventEmitter.on('CONNECT', (event_data) => {
        console.log("CONNECT event");
        websocketProvider.postconnect();
        userProvider.clearAll();
        console.log(event_data);
        Object.values(event_data["users"]).forEach(user => {
            user['clients'].forEach(clientid => {
                let client = new RenderManager.RenderManager(clientid, user["name"], userManager, user["color"]);
                clients[clientid] = {
                    client: client,
                    userId: user["userId"],
                    color: user["color"],
                    name: user["name"],
                    state: user['state']
                };
                console.log("Finished adding client");
            });
            userProvider.addUser(user["name"], user['state']);
        });
        Object.values(event_data["chatHistory"]).forEach(chat => {
            chatProvider.addChatItem(chat["id"], chat["userId"], chat["name"], chat["text"], chat["timestamp"]);
        });
    });
    
    eventEmitter.on('EDIT_UPDATE', (event_data) => {
        console.log("Start processing EDIT_UPDATE");
    
        editManager.revNum = event_data["revNum"];
    
        if (event_data["clientId"] == vfsid) {
            console.log("Ignoring echoed change");
            return;
        }
    
        // TODO: Check revNum and make sure we're in sync
    
        //event_data['revNum'] == 48
        //event_data['selection'] == [1,2,3,4,5]
        let fileName = event_data["docId"];
    
        let documentUri = Utils.FileNameToUri(fileName);
        let editCursor = 0;
        let textDocument = null;
        vscode.workspace.textDocuments.forEach(td => {
            if (td.uri.fsPath == documentUri.fsPath) {
                textDocument = td;
            }
        });

        if (textDocument == null) {
            console.warn("Could not find document for EDIT_UPDATE");
            return;
        }
    
        let edit = new vscode.WorkspaceEdit();

        if ("op" in event_data) {
            event_data["op"].forEach(action => {
                if (action[0] == "r") {
                    editCursor += parseInt(action.substring(1));
                } else if (action[0] == "i") {
                    edit.insert(
                        documentUri,
                        textDocument.positionAt(editCursor),
                        action.substring(1)
                    );
                    editManager.addRemoteEdit(edit);
                    //editCursor += action.substring(1).length; TODO: Logic is needed?
                } else if (action[0] == "d") {
                    console.warn("d-based debug");
                    console.log(textDocument.positionAt(editCursor));
                    console.log(action.substring(1).length);
                    let delete_range = new vscode.Range(
                        textDocument.positionAt(editCursor),
                        textDocument.positionAt(editCursor + action.substring(1).length)
                    );
                    console.log(delete_range);
                    edit.delete(
                        documentUri,
                        delete_range
                    );

                    let expected_deltext = editManager.lastKnownRemoteDocumentText[Utils.EnsureLeadingSlash(fileName)].substring(editCursor, editCursor + action.substring(1).length);
                    let actual_deltext = action.substring(1);
                    if (expected_deltext != actual_deltext) {
                        console.warn("Triggering SYNC_COMMIT due to deltext mismatch");
                        console.log(expected_deltext);
                        console.log(actual_deltext);
                        console.warn("---");
                        eventEmitter.emit("SYNC_COMMIT", {
                            docId: event_data['docId']
                        });
                        return;
                    }

                    editManager.addRemoteEdit(edit);
                    editCursor += action.substring(1).length;
                }
            });

            // Delete any remaining range
            let remainingRange = new vscode.Range(
                textDocument.positionAt(editCursor),
                textDocument.positionAt(9999999999999999999999) // TODO: Fix hack
            );
            
            if (!remainingRange.isEmpty) {
                console.warn("Doing a remaining range delete");
                edit.delete(
                    documentUri,
                    remainingRange
                );
                editManager.addRemoteEdit(edit);
            }

            console.log(edit);
            vscode.workspace.applyEdit(edit);
            console.warn("Applied edit");

            // Set selection pointer
            let client = clients[event_data["clientId"]];
            vscode.workspace.openTextDocument(documentUri)
            .then((document) => {
                userManager.setPosition(event_data["clientId"], fileName, document, {
                    start: new vscode.Position(event_data["selection"][0], event_data["selection"][1]),
                    end: new vscode.Position(event_data["selection"][2], event_data["selection"][3])
                }, event_data["selection"][4]);
                client['client'].refresh();
            });
        }
    
        editManager.lastKnownRemoteDocumentText[Utils.EnsureLeadingSlash(fileName)] = textDocument.getText();
    
        console.log("Finish processing EDIT_UPDATE");
    });
    
    eventEmitter.on('CURSOR_UPDATE', (event_data) => {
        if (event_data["clientId"] == vfsid) return;
                                
        let client = clients[event_data["clientId"]];
    
        console.log("CURSOR UPDATE");
    
        let fileName = event_data["docId"];
        let documentUri = Utils.FileNameToUri(fileName);
        vscode.workspace.openTextDocument(documentUri)
            .then((document) => {
                userManager.setPosition(event_data["clientId"], fileName, document, {
                    start: new vscode.Position(event_data["selection"][0], event_data["selection"][1]),
                    end: new vscode.Position(event_data["selection"][2], event_data["selection"][3])
                }, event_data["selection"][4]);
                client['client'].refresh();
            });
    });

    // TODO: eventEmitter.on('USER_STATE', (event_data) => {     event_data.state == idle
    
    eventEmitter.on('ch4_data', (data, environmentId) => {
        if (Array.isArray(data)) {
            if (data.length>2) {
                if (data[0] == "onData") {
                    try {
                        let contents = JSON.parse(data[2]);
                        if ([
                            "USER_JOIN",
                            "USER_LEAVE",
                            "JOIN_DOC",
                            "SYNC_COMMIT",
                            "CONNECT",
                            "EDIT_UPDATE",
                            "CURSOR_UPDATE",
                            "CHAT_MESSAGE",
                            "CLEAR_CHAT"
                        ].includes(contents["type"])) {
                            eventEmitter.emit(contents["type"], contents["data"]); // TODO: Handle unknown events
                        }
                    } catch (err) {
                        ; // don't care
                    }
                }
            }
        }
    });
}

/////

function refreshEnvironmentsInSidebar() {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    if (!extensionConfig.get('accessKey') || !extensionConfig.get('secretKey')) {
        return;
    }
    
    environmentProvider.clearAll();

    let awsreq = aws4.sign({
        service: 'cloud9',
        region: awsregion,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.ListEnvironments'
        },
        body: '{}'
    },
    {
        secretAccessKey: extensionConfig.get('secretKey'),
        accessKeyId: extensionConfig.get('accessKey')
    });

    request.post({
        url: "https://" + awsreq.hostname + awsreq.path,
        headers: awsreq.headers,
        body: awsreq.body,
        rejectUnauthorized: false
    }, function(err, httpResponse, env_token) {
        console.log(err);
        console.log(httpResponse);
        if (err != null || !httpResponse.statusCode.toString().startsWith("2")) {
            vscode.window.setStatusBarMessage("Unable to connect to list environments", 5000);
            return;
        }

        let response = JSON.parse(httpResponse['body']);

        let awsreq = aws4.sign({
            service: 'cloud9',
            region: awsregion,
            method: 'POST',
            path: '/',
            headers: {
              'Content-Type': 'application/x-amz-json-1.1',
              'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.DescribeEnvironments'
            },
            body: '{"environmentIds":' + JSON.stringify(response.environmentIds) + '}'
        },
        {
            secretAccessKey: extensionConfig.get('secretKey'),
            accessKeyId: extensionConfig.get('accessKey')
        });

        request.post({
            url: "https://" + awsreq.hostname + awsreq.path,
            headers: awsreq.headers,
            body: awsreq.body
        }, function(err, httpResponse, env_token) {
            let response = JSON.parse(httpResponse['body']);
            if ('environments' in response) {
                response['environments'].forEach(env => {
                    environmentProvider.addEnvironment(env);
                });
            }
        });
    });
}

function checkEnvironmentStatus(environmentId) {
    return new Promise((resolve, reject) => {
        extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
        awsregion = extensionConfig.get('region');

        let awsreq = aws4.sign({
            service: 'cloud9',
            region: awsregion,
            method: 'POST',
            path: '/',
            headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.DescribeEnvironmentStatus'
            },
            body: '{"environmentId":"' + environmentId + '"}'
        },
        {
            secretAccessKey: extensionConfig.get('secretKey'),
            accessKeyId: extensionConfig.get('accessKey')
        });

        request.post({
            url: "https://" + awsreq.hostname + awsreq.path,
            headers: awsreq.headers,
            body: awsreq.body
        }, function(err, httpResponse, env_token) {
            let response = JSON.parse(httpResponse['body']);

            if (response['status'] == "ready") {
                resolve(response);
            }

            reject(response);
        });
    });
}

function doConnect(environmentId) {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    cookieJar = request.jar();
    clients = {};
    userManager = new UserManager.UserManager();
    last_unacknowledged_edit = null;
    pending_edit = null;

    let awsreq = aws4.sign({
        service: 'cloud9',
        region: awsregion,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.CreateEnvironmentToken'
        },
        body: '{"staticPrefix":"https://d3gac9ws0uwh3y.cloudfront.net/c9-4.1.0-d04633a7-ide","environmentId":"' + environmentId + '"}'
    },
    {
        secretAccessKey: extensionConfig.get('secretKey'),
        accessKeyId: extensionConfig.get('accessKey')
    });

    console.log("Requesting token...");
    request.post({
        url: "https://" + awsreq.hostname + awsreq.path,
        headers: awsreq.headers,
        body: awsreq.body
    }, function(err, httpResponse, env_token) {
        let env_token_json = JSON.parse(env_token);
        if ('Message' in env_token_json && !('authenticationTag' in env_token_json)) {
            vscode.window.showWarningMessage(env_token_json['Message']);
            commandDisconnect();
            return;
        }
        
        console.log("Logging in to primary gateway...");
        request.post({
            url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId,
            jar: cookieJar,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId
            },
            body: '{"version":13,"token":' + env_token + '}'
        }, function(err, httpResponse, body) {
            console.log("Verifying gateway...");
            console.log(err);
            console.log(body);
            xauth = httpResponse.headers['x-authorization'];
            vfsid = JSON.parse(body)['vfsid'];
            console.log("xauth: " + xauth);
            console.log("VFSID: " + vfsid);

            userManager.addIgnoredClient(vfsid);
            editManager.vfsid = vfsid;

            request.get({
                url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid,
                jar: cookieJar,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                    'x-authorization': xauth
                }
            }, function(err, httpResponse, body) {
                // TODO: Generate t
                request.get({
                    url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/socket/?authorization=' + xauth + '&EIO=3&transport=polling',
                    jar: cookieJar,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                        'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                        'x-authorization': xauth
                    }
                }, function(err, httpResponse, body) {
                    let buf = Buffer.from(body).slice(7);
                    let bufasjson = JSON.parse(buf.toString());
                    let sid = bufasjson['sid'];
                    console.log("sid: " + sid);
                    request.post({
                        url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/socket/?authorization=' + xauth + '&EIO=3&transport=polling&sid=' + sid,
                        jar: cookieJar,
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'text/plain;charset=UTF-8',
                            'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                            'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                            'x-authorization': xauth
                        },
                        body: '46:4{"type":"handshake","seq":20000,"version":13}'
                    }, function(err, httpResponse, body) {
                        console.log("46 POST returned");
                        request.get({
                            url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/socket/?authorization=' + xauth + '&EIO=3&transport=polling',
                            jar: cookieJar,
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                                'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                                'x-authorization': xauth
                            }
                        }, function(err, httpResponse, body) {
                            console.log("46 GET Return:");
                            console.log(body);
                            /*let buf = Buffer.from(body).slice(7);
                            let bufasjson = JSON.parse(buf.toString());
                            let sid = bufasjson['sid'];*/
                            request.post({
                                url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/socket/?authorization=' + xauth + '&EIO=3&transport=polling&sid=' + sid,
                                jar: cookieJar,
                                headers: {
                                    'Accept': 'application/json',
                                    'Content-Type': 'text/plain;charset=UTF-8',
                                    'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                                    'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                                    'x-authorization': xauth
                                },
                                body: '14:4{"ack":10000}'
                            }, function(err, httpResponse, body) {
                                console.log("14:4 POST returned");
                                console.log(body);
                                request.post({
                                    url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/socket/?authorization=' + xauth + '&EIO=3&transport=polling&sid=' + sid,
                                    jar: cookieJar,
                                    headers: {
                                        'Content-Type': 'text/plain;charset=UTF-8',
                                        'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                                        'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId,
                                        'x-authorization': xauth
                                    },
                                    body: '48:4{"ack":10000,"seq":20001,"d":["ready",{"$":1}]}'
                                }, function(err, httpResponse, body) {
                                    console.log("48:4 POST returned");
                                    console.log(body);

                                    fileManager.xauth = xauth;
                                    fileManager.cookieJar = cookieJar;
                                    fileManager.environmentId = environmentId;
                                    websocketProvider.connect(vfsid, xauth, sid, cookieJar, environmentId);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function do_sync(sync_type) {
    return new Promise(function(resolve, reject) {
        environmentProvider.getChildren().then((envs) => {
            envs.forEach(env => {
                if (env.id == connectedEnvironment.id) {
                    env.setSyncing();
                }
            });
            environmentProvider.refresh();
        });

        if (sync_type == "bidirectional") {
            fileManager.recursiveDownload("").then(() => {
                fileManager.recursiveUpload("").then(() => {
                    environmentProvider.getChildren().then((envs) => {
                        envs.forEach(env => {
                            if (env.id == connectedEnvironment.id) {
                                env.setConnected();
                            }
                        });
                        environmentProvider.refresh();
                        resolve();
                    });
                });
            }).catch((error) => {
                console.error(error);
                reject();
            });
        } else if (sync_type == "downloadonly") {
            fileManager.recursiveDownload("").then(() => {
                environmentProvider.getChildren().then((envs) => {
                    envs.forEach(env => {
                        if (env.id == connectedEnvironment.id) {
                            env.setConnected();
                        }
                    });
                    environmentProvider.refresh();
                    resolve();
                });
            }).catch((error) => {
                console.error(error);
                reject();
            });
        }
    });
}

function process_cursor_update(event) {
    if (event.selections.length > 0 && Object.values(editManager.recent_edits).length == 0) {
        websocketProvider.send_ch4_message(
            [
                "call",
                "collab",
                "send",
                [
                    vfsid,
                    {
                        "type":"CURSOR_UPDATE",
                        "data":
                        {
                            "docId": Utils.ShortenFilePath(event.textEditor.document.fileName),
                            "selection": [
                                event.selections[0].start.line,
                                event.selections[0].start.character,
                                event.selections[0].end.line,
                                event.selections[0].end.character,
                                event.selections[0].isReversed
                            ]
                        }
                    }
                ]
            ]
        );
    }
}

function createWatchers() {
    watcher = vscode.workspace.createFileSystemWatcher("**");
    watcher.ignoreChangeEvents = false;
    watcher.ignoreCreateEvents = false;
    watcher.ignoreDeleteEvents = false;

    watcher.onDidChange((event) => {
        console.log(event);
        //uploadExistingFile(event.fsPath, fs.readFileSync(event.fsPath));
    });
    watcher.onDidCreate((event) => {
        console.log(event);
        //uploadNewFile(event.fsPath, fs.readFileSync(event.fsPath));
        // TODO: Handle dirs
    });
    watcher.onDidDelete((event) => {
        console.log(event);
        //deleteRemoteFile(event.fsPath);
    });

    vscode.window.onDidChangeVisibleTextEditors(function(evt) {
        let newVisibleDocuments = [];
        evt.forEach(visibleEditors => {
            newVisibleDocuments.push(visibleEditors.document.fileName);
        });
    
        newVisibleDocuments.forEach(newVisibleDocument => {
            if (!visibleDocuments.includes(newVisibleDocument)) {
                console.log("Joining new document: " + newVisibleDocument);
                join_doc_chunks = [];
                websocketProvider.send_ch4_message(
                    ["call","collab","send",[vfsid,{"type": "JOIN_DOC","data": {
                        "docId": Utils.ShortenFilePath(newVisibleDocument),
                        "reqId": Math.floor(9007199254740992*Math.random())
                    }}]]
                );
                websocketProvider.send_ch4_message(
                    ["watch", Utils.ShortenFilePath(newVisibleDocument), {}, {$: 10}]
                );
            }
        });
        visibleDocuments.forEach(visibleDocument => {
            if (!newVisibleDocuments.includes(visibleDocument)) {
                console.log("Leaving document: " + visibleDocument);
                websocketProvider.send_ch4_message(
                    ["call","collab","send",[vfsid,{"type":"LEAVE_DOC","data":{
                        "docId": Utils.ShortenFilePath(visibleDocument)
                    }}]]
                );
            }
        });

        visibleDocuments = newVisibleDocuments;
    });

    vscode.workspace.onDidChangeTextDocument(function(evt) {
        evt.contentChanges.forEach(change => {
            editManager.processTextDocumentChange(change, evt);
        });
    });

    console.log("Watchers started...");
}
