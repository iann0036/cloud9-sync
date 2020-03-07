const vscode = require('vscode');
const request = require('request');
const aws4 = require('aws4');
const path = require('path');
const fs = require('fs');
const RenderManager = require("./renderManager");
const cookie = require('cookie');
const ViewProviders = require("./viewProviders");
const Utils = require("./utils");
const UserManager = require("./userManager");
const TerminalManagerV2 = require("./terminalManagerV2");
const WebsocketProvider = require("./websocketProvider");
const FileManager = require("./fileManager");
const EditManager = require("./editManager");

const ContentProvider = require("./contentProvider");
const FileSystemProvider = require("./fileSystemProvider");

const events = require('events');

let cookieJar, xauth, vfsid, watcher, clients, awsregion;
let connectedEnvironment;
let activationInterval, extensionConfig, connectionRefreshInterval;
let activationIntervalMaxTries, visibleDocuments;
let join_doc_chunks = [], statusBarItem;

let userProvider, environmentProvider, environmentView, userManager;
let terminalManager, eventEmitter, websocketProvider, fileManager, editManager, chatProvider;

let p, connectionPromise, watcherEventListeners = [];

let cloud9fs;

let activeEnvironmentInfo;

function activate(context) {
    console.log('"cloud9-sync" is active');

    eventEmitter = new events.EventEmitter();
    setEventEmitterEvents();

    userProvider = new ViewProviders.UserProvider();
    environmentProvider = new ViewProviders.EnvironmentProvider();
    chatProvider = new ViewProviders.ChatProvider();
    websocketProvider = new WebsocketProvider.WebsocketProvider(eventEmitter);
    terminalManager = new TerminalManagerV2.TerminalManager(eventEmitter, websocketProvider);
    fileManager = new FileManager.FileManager(eventEmitter, websocketProvider);
    editManager = new EditManager.EditManager(eventEmitter, websocketProvider);

    vscode.window.createTreeView('live-sync-for-aws-cloud9-view-2-users', {
        'treeDataProvider': userProvider
    });
    environmentView = vscode.window.createTreeView('live-sync-for-aws-cloud9-view-1-environments', {
        'treeDataProvider': environmentProvider
    });
    vscode.window.createTreeView('live-sync-for-aws-cloud9-view-3-chat', {
        'treeDataProvider': chatProvider
    });

    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.setup', commandSetup));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.connect', commandConnect));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.disconnect', commandDisconnect));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.resync', commandResync));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.refreshenvironments', commandRefreshenvironments));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.initterminal', commandInitterminal));
    //context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.initsharedterminal', commandInitsharedterminal));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.sendchat', commandSendchat));
    //context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.syncupfsitem', commandSyncupfsitem));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.addenvironment', commandAddenvironment));
    context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.addenvtoworkspace', commandAddenvtoworkspace));
    //context.subscriptions.push(vscode.commands.registerCommand('cloud9sync.showfilerevisions', commandShowfilerevisions));

    /*
    TODO: implement this for ReadOnly users

    vscode.workspace.registerTextDocumentContentProvider('cloud9', new ContentProvider.Cloud9ContentProvider());
    
    vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.uri.scheme !== "cloud9") {
            vscode.commands.executeCommand("workbench.action.closeActiveEditor").then(() => {
                vscode.commands.executeCommand('vscode.open', uri.with({ scheme: 'cloud9' }))
                    .then(null, vscode.window.showErrorMessage);
            }, vscode.window.showErrorMessage);
        }
    });
    */
    
    const cloud9fs = new FileSystemProvider.Cloud9FileSystemProvider(fileManager, eventEmitter, websocketProvider);
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('cloud9', cloud9fs, { isCaseSensitive: true }));

    refreshEnvironmentsInSidebar().then(envs => {
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
                if (workspaceFolder.uri.scheme == "cloud9") {
                    vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
                    return;
                }
            });
        }

        // TODO: Check for auto-connect here
    });
}
exports.activate = activate;

function deactivate() {
    console.log('"cloud9-sync" has been deactivated')
}
exports.deactivate = deactivate;

function commandShowfilerevisions(ctx) {
    vscode.commands.executeCommand('vscode.setEditorLayout', {
        "orientation": 1,
        "groups": [{ "size": 0.8 }, { "size": 0.2 }]
    }).then(() => {
        let panel = vscode.window.createWebviewPanel('c9FileRevisions', 'File Revisions', vscode.ViewColumn.Two, {});
        panel.webview.html = '';
    }, vscode.window.showErrorMessage);
}

function commandSyncupfsitem(ctx) {
    fs.stat(ctx.fsPath, (err, fstat) => {
        if (fstat.isDirectory()) {
            fileManager.recursiveUpload(Utils.ShortenFilePath(ctx.fsPath));
        } else if (fstat.isFile()) {
            fileManager.uploadExistingFile(Utils.ShortenFilePath(ctx.fsPath), fs.readFileSync(ctx.fsPath));
        }
    });
}

function commandAddenvironment() {
    Utils.GetAWSCreds().then(aws_creds => {
        if (aws_creds == null) {
            vscode.window.setStatusBarMessage("Fill in your AWS credentials to begin", 5000);
            commandSetup();
            return;
        }

        vscode.window.showInputBox({
            placeHolder: "",
            prompt: "Environment name.",
            value: "",
            ignoreFocusOut: true
        }).then(env_name => {
            if (env_name && env_name.length > 0) {
                extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
                awsregion = extensionConfig.get('region');

                let idemToken = "LiveSyncCloud9" + Math.floor(Math.random() * 9999999999).toString();

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
                }, aws_creds);

                vscode.window.setStatusBarMessage("Creating your environment...", 5000);

                request.post({
                    url: "https://" + awsreq.hostname + awsreq.path,
                    headers: awsreq.headers,
                    body: awsreq.body,
                    proxy: Utils.GetProxy()
                }, function(err, httpResponse, env_token) {
                    let response = JSON.parse(httpResponse['body']);

                    console.log(response);

                    refreshEnvironmentsInSidebar();

                    vscode.window.setStatusBarMessage("Environment created", 5000);
                });
            }
        });
    });
}

function commandSendchat() {
    // TODO: Check if connected

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

function commandAddenvtoworkspace(ctx) {
    vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('cloud9:/' + ctx.id + '/'), name: ctx.name + " - Cloud9" });
    //vscode.commands.executeCommand("workbench.action.reloadWindow");
}

function commandInitterminal() {
    terminalManager.addTerminal(false, vfsid, activeEnvironmentInfo);
}

function commandInitsharedterminal() {
    vscode.window.showInformationMessage("Shared terminals will be presented to all users, regardless of permission level. Do you want to continue?", "Cancel", "OK").then((response) => {
        if (response == "OK") {
            terminalManager.addTerminal(true, vfsid, activeEnvironmentInfo);
        }
    });
}

function commandResync() {
    vscode.window.setStatusBarMessage('Resyncing...', 5000);

    let syncStrategy = extensionConfig.get('syncStrategy');

    do_sync(syncStrategy).then(function(){
        vscode.window.setStatusBarMessage('Resync complete', 5000);
    }).catch(function(){
        vscode.window.setStatusBarMessage('Resync failed', 5000);
    });
}

function commandConnect(ctx) {
    eventEmitter.emit('disconnect');

    //vscode.window.setStatusBarMessage('Connecting...', 10000);

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
            connectedEnvironment.setConnecting();
            environmentProvider.refresh();

            vscode.window.withProgress({
                //title: "Connection Status",
                location: vscode.ProgressLocation.Window
            }, (p_local) => new Promise((connectionPromise_local) => {
        
                p = p_local;
                connectionPromise = connectionPromise_local;
        
                p.report({message: "Checking Cloud9 environment status"});
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
                        body: awsreq.body,
                        proxy: Utils.GetProxy()
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
            }));
        }
    });


}

function commandDisconnect() {
    eventEmitter.emit('disconnect');
    p.report({message: ""}); // TODO: Replace me with connectionPromise.resolve()
}

function commandRefreshenvironments() {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    Utils.GetAWSCreds().then(aws_creds => {
        if (aws_creds == null) {
            vscode.window.setStatusBarMessage("Fill in your AWS credentials to begin", 5000);
            commandSetup();
            return;
        }
    
        vscode.window.setStatusBarMessage('Refreshing environments...', 5000);
        refreshEnvironmentsInSidebar();
    });
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

        extensionConfig.update("accessKey", config['accessKey'], vscode.ConfigurationTarget.Global).then(() => {
            return extensionConfig.update("secretKey", config['secretKey'], vscode.ConfigurationTarget.Global);
        }).then(() => {
            return extensionConfig.update("region", regionReponse, vscode.ConfigurationTarget.Global);
        }).then(() => {
            vscode.window.setStatusBarMessage('Refreshing environments...', 5000);
            refreshEnvironmentsInSidebar();
        });
    });
}

/////

function setEventEmitterEvents() {
    eventEmitter.on('send_ch4_message', (data) => {
        websocketProvider.send_ch4_message(data);
    });

    eventEmitter.on('request_connect', (environment) => {
        refreshEnvironmentsInSidebar().then(() => {
            commandConnect(environment);
        });
    });

    eventEmitter.on('disconnect', () => {
        // TODO: connectionPromise.resolve()
        if (statusBarItem) {
            statusBarItem.hide();
        }
        terminalManager.closeAll();
        userProvider.clearAll();
        environmentProvider.disconnectAll();
        chatProvider.clearAll();
        websocketProvider.disconnect();
        clearInterval(connectionRefreshInterval);

        /* TODO
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
                if (workspaceFolder.uri.scheme == "cloud9" && workspaceFolder.uri.path.startsWith("/" + connectedEnvironment.id)) {
                    vscode.workspace.updateWorkspaceFolders(workspaceFolder.index, 1);
                }
            });
        }
        */
    });

    eventEmitter.on('websocket_init_complete', () => {

        console.log("WebSocket Init Complete, doing JOIN_DOCs");
        visibleDocuments = [];
    
        vscode.window.visibleTextEditors.forEach(editor => {
            join_doc_chunks = [];
            websocketProvider.send_ch4_message(
                ["call","collab","send",[vfsid,{"type": "JOIN_DOC","data": {
                    "docId": Utils.GetShortFilePath(editor.document),
                    "reqId": Math.floor(9007199254740992*Math.random())
                }}]]
            );
            websocketProvider.send_ch4_message(
                ["watch", Utils.GetShortFilePath(editor.document), {}, {$: websocketProvider.next_event_id()}]
            );
            visibleDocuments.push(editor.document.fileName);
        });
        console.log("Done JOIN_DOCs, doing TextEditorChangeSelection listener");
    
        vscode.window.onDidChangeTextEditorSelection(process_cursor_update);

        extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
        let syncStrategy = extensionConfig.get('syncStrategy');

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

        /* Don't prompt to sync if no file workspaces exist */
        let foundFileWorkspace = false;
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
                if (workspaceFolder.uri.scheme == "file") {
                    foundFileWorkspace = true;
                }
            });
        }
        if (!foundFileWorkspace) {
            syncStrategy = "none";
        }
        
        setTimeout(() => { // TODO: This blocks, why does this block?!?
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
                }).catch(() => {
                    continueSync("none");
                });
            } else {
                continueSync(syncStrategy);
            }
        }, 1);
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
        userProvider.setUserState(event_data["userId"], event_data["user"]["state"]);
        vscode.window.setStatusBarMessage(event_data["user"]["name"] + ' has joined the workspace', 5000);
    });
    
    eventEmitter.on('USER_LEAVE', (event_data) => {
        if (event_data["clientId"] == vfsid) return;
        vscode.window.setStatusBarMessage(clients[event_data["clientId"]]["name"] + ' has left the workspace', 5000);
        userProvider.setUserState(event_data["userId"], "offline"); // TODO: Check for multiple online clients
        clients[event_data["clientId"]]["client"].destroy();
        userManager.removeClient(event_data["clientId"]);
        clients.splice(event_data["clientId"], 1);
    });
    
    eventEmitter.on('CHAT_MESSAGE', (event_data) => {
        vscode.window.setStatusBarMessage(event_data.name + ': ' + event_data.text, 5000);
        chatProvider.addChatItem(event_data.id, event_data.userId, event_data.name, event_data.text, event_data.timestamp);
    });

    eventEmitter.on('CLEAR_CHAT', (event_data) => {
        if ('clear' in event_data) {
            chatProvider.clearAll();
        } else if ('id' in event_data) {
            chatProvider.removeChatItem(event_data['id']);
        } else {
            console.warn("Unknown CLEAR_CHAT data");
            console.log(event_data);
        } 
    });
    
    eventEmitter.on('JOIN_DOC', (event_data) => {
        let chunk = event_data["chunk"];
        join_doc_chunks.push(chunk); // TODO: Make indexed
        if (event_data["chunksLength"] == event_data["chunkNum"]) {
            // Update open copy
            let join_doc_response = JSON.parse(join_doc_chunks.join(""));
            join_doc_chunks = [];
    
            let path = Utils.EnsureLeadingSlash(event_data["docId"]);
            let document = null;

            vscode.workspace.textDocuments.forEach(doc => {
                if (Utils.GetShortFilePath(doc) == Utils.EnsureLeadingSlash(event_data["docId"])) {
                    document = doc;
                }
            });

            if (document == null) {
                console.warn("Couldn't find document to process JOIN_DOC");
                return;
            }
    
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
            vscode.workspace.applyEdit(edit).then(() => {
                editManager.lastKnownRemoteDocumentText[Utils.ShortenFilePath(path)] = join_doc_response['contents'];
                editManager.lastKnownLocalDocumentText[Utils.ShortenFilePath(path)] = join_doc_response['contents'];
                console.log("Initialized lastKnownTexts for doc: " + Utils.ShortenFilePath(path));
                editManager.revNum = join_doc_response['revNum'];
            });

            // Set Selections

            Object.values(join_doc_response['selections']).forEach(client => {
                let internalclient = clients[client["clientId"]];

                userManager.setPosition(client["clientId"], path, document, {
                    start: new vscode.Position(client["selection"][0], client["selection"][1]),
                    end: new vscode.Position(client["selection"][2], client["selection"][3])
                }, client["selection"][4]);

                internalclient['client'].refresh();
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
            ["watch", event_data["docId"], {}, {$: websocketProvider.next_event_id()}]
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
            userProvider.addUser(user["userId"], user["name"], user['state']);
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
    
        let editCursor = 0;
        let textDocument = null;
        vscode.workspace.textDocuments.forEach(td => {
            if (Utils.GetShortFilePath(td) == Utils.EnsureLeadingSlash(fileName)) {
                textDocument = td;
            }
        });
        let documentUri = textDocument.uri;

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
                    let delete_range = new vscode.Range(
                        textDocument.positionAt(editCursor),
                        textDocument.positionAt(editCursor + action.substring(1).length)
                    );
                    
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
            vscode.workspace.applyEdit(edit).then(() => {
                console.warn("Applied edit");

                // Set selection pointer
                let client = clients[event_data["clientId"]];

                
                vscode.workspace.textDocuments.forEach(document => {
                    if (Utils.GetShortFilePath(document) == Utils.EnsureLeadingSlash(event_data["docId"])) {
                        userManager.setPosition(event_data["clientId"], fileName, document, {
                            start: new vscode.Position(event_data["selection"][0], event_data["selection"][1]),
                            end: new vscode.Position(event_data["selection"][2], event_data["selection"][3])
                        }, event_data["selection"][4]);
                        client['client'].refresh();
                    }
                });

                editManager.lastKnownRemoteDocumentText[Utils.EnsureLeadingSlash(fileName)] = textDocument.getText();
                
                console.log("Finish processing EDIT_UPDATE");
            });
        }
    });
    
    eventEmitter.on('CURSOR_UPDATE', (event_data) => {
        if (event_data["clientId"] == vfsid) return;
                                
        let client = clients[event_data["clientId"]];
    
        console.log("CURSOR UPDATE");
    
        let fileName = event_data["docId"];

        console.log(vscode.workspace.textDocuments);

        vscode.workspace.textDocuments.forEach(document => {
            if (Utils.GetShortFilePath(document) == Utils.EnsureLeadingSlash(fileName)) {
                console.warn("setting pos for " + fileName);
                userManager.setPosition(event_data["clientId"], Utils.EnsureLeadingSlash(fileName), document, {
                    start: new vscode.Position(event_data["selection"][0], event_data["selection"][1]),
                    end: new vscode.Position(event_data["selection"][2], event_data["selection"][3])
                }, event_data["selection"][4]);
                client['client'].refresh();
            }
        });
    });

    eventEmitter.on('USER_STATE', (event_data) => {
        userProvider.setUserState(event_data.userId, event_data.state);
    });
    
    eventEmitter.on('ch4_data', (data, environmentId) => {
        if (Array.isArray(data)) {
            if (data.length>2) {
                if (data[0] == "onData") {
                    try {
                        let contents = JSON.parse(data[2]);
                        if ([ // TODO: FILE_SAVED
                            "USER_JOIN",
                            "USER_LEAVE",
                            "JOIN_DOC",
                            "SYNC_COMMIT",
                            "CONNECT",
                            "EDIT_UPDATE",
                            "CURSOR_UPDATE",
                            "CHAT_MESSAGE",
                            //"GENERIC_BROADCAST",
                            "USER_STATE",
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

function listEnvironments(awsregion, aws_creds, environmentIds, nextToken) {
    return new Promise((resolve, reject) => {
        var body = '{}'

        if (nextToken) {
            body = '{"nextToken": "' + nextToken + '"}';
        }

        let awsreq = aws4.sign({
            service: 'cloud9',
            region: awsregion,
            method: 'POST',
            path: '/',
            headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.ListEnvironments'
            },
            body: body
        }, aws_creds);

        request.post({
            url: "https://" + awsreq.hostname + awsreq.path,
            headers: awsreq.headers,
            body: awsreq.body,
            rejectUnauthorized: false,
            proxy: Utils.GetProxy()
        }, function(err, httpResponse, env_token) {
            console.log(err);
            console.log(httpResponse);
            if (err != null || !httpResponse.statusCode.toString().startsWith("2")) {
                vscode.window.setStatusBarMessage("Unable to connect to list environments", 5000);
                resolve(environmentIds);
                return;
            }

            let response = JSON.parse(httpResponse['body']);

            environmentIds = environmentIds.concat(response.environmentIds);

            if (response.nextToken) {
                listEnvironments(awsregion, aws_creds, environmentIds, response.nextToken).then(envIds => {
                    resolve(envIds);
                });
            } else {
                resolve(environmentIds);
            }
        });
    });
}

function refreshEnvironmentsInSidebar() {
    return new Promise((resolve, reject) => {
        Utils.GetAWSCreds().then(aws_creds => {
            extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
            awsregion = extensionConfig.get('region');

            if (!extensionConfig.get('accessKey') || !extensionConfig.get('secretKey')) {
                console.log("Keys not set");
                resolve([]);
                return;
            }

            listEnvironments(awsregion, aws_creds, [], false).then(environmentIds => {
                environmentProvider.clearAll(); // TODO: Make this do a merge instead of replace

                let envPromises = [];

                while (environmentIds.length) {
                    let bodyEnvIds = JSON.stringify(environmentIds.splice(0, 25));

                    envPromises.push(new Promise((resolve, reject) => {
                        let awsreq = aws4.sign({
                            service: 'cloud9',
                            region: awsregion,
                            method: 'POST',
                            path: '/',
                            headers: {
                            'Content-Type': 'application/x-amz-json-1.1',
                            'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.DescribeEnvironments'
                            },
                            body: '{"environmentIds":' + bodyEnvIds + '}'
                        }, aws_creds);

                        request.post({
                            url: "https://" + awsreq.hostname + awsreq.path,
                            headers: awsreq.headers,
                            body: awsreq.body,
                            proxy: Utils.GetProxy()
                        }, function(err, httpResponse, env_token) {
                            console.log(err);
                            console.log(httpResponse);
                            let response = JSON.parse(httpResponse['body']);
                            if ('environments' in response) {
                                response['environments'].forEach(env => {
                                    if (extensionConfig.get('environmentOwner') && extensionConfig.get('environmentOwner') != "") {
                                        if (env.ownerArn.includes(extensionConfig.get('environmentOwner'))) {
                                            environmentProvider.addEnvironment(env);
                                        }
                                    } else {
                                        environmentProvider.addEnvironment(env);
                                    }
                                });
                                resolve(response['environments']);
                            }
                        });
                    }));
                }

                Promise.all(envPromises).then(envListResults => {
                    resolve([].concat.apply([], envListResults));
                });
            });
        });
    });
}

function checkEnvironmentStatus(environmentId) {
    return new Promise((resolve, reject) => {
        Utils.GetAWSCreds().then(aws_creds => {
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
            }, aws_creds);

            request.post({
                url: "https://" + awsreq.hostname + awsreq.path,
                headers: awsreq.headers,
                body: awsreq.body,
                proxy: Utils.GetProxy()
            }, function(err, httpResponse, env_token) {
                let response = JSON.parse(httpResponse['body']);

                if (response['status'] == "ready") {
                    resolve(response);
                }

                reject(response);
            });
        });
    });
}

function refreshConnection(environmentId) {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    Utils.GetAWSCreds().then(aws_creds => {
        let awsreq = aws4.sign({
            service: 'cloud9',
            region: awsregion,
            method: 'POST',
            path: '/',
            headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.CreateEnvironmentToken'
            },
            body: '{"environmentId":"' + environmentId + '","refresh":true}'
        }, aws_creds);

        console.log("Requesting token...");
        request.post({
            url: "https://" + awsreq.hostname + awsreq.path,
            headers: awsreq.headers,
            body: awsreq.body,
            proxy: Utils.GetProxy()
        }, function(err, httpResponse, env_token) {
            let env_token_json = JSON.parse(env_token);
            if ('Message' in env_token_json && !('authenticationTag' in env_token_json)) {
                vscode.window.showWarningMessage(env_token_json['Message']);
                commandDisconnect();
                return;
            }
            
            console.log("Refreshing connection to primary gateway...");
            request.post({
                url: 'https://vfs.cloud9.' + awsregion + '.amazonaws.com/vfs/' + environmentId + '/' + vfsid + '/refresh',
                jar: cookieJar,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': 'https://' + awsregion + '.console.aws.amazon.com',
                    'Referer': 'https://' + awsregion + '.console.aws.amazon.com/cloud9/ide/' + environmentId
                },
                body: '{"version":13,"token":' + env_token + '}',
                proxy: Utils.GetProxy()
            }, function(err, httpResponse, body) {
                console.log("Completed connection refresh");
            });
        });
    });
}

function doConnect(environmentId) {
    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    awsregion = extensionConfig.get('region');

    cookieJar = request.jar();
    clients = {};
    userManager = new UserManager.UserManager();

    connectionRefreshInterval = setInterval((environmentId) => {
        console.warn("Refreshing connection");
        refreshConnection(environmentId);
    }, 300000, environmentId); // 5 mins

    Utils.GetAWSCreds().then(aws_creds => {
        let awsreq = aws4.sign({
            service: 'cloud9',
            region: awsregion,
            method: 'POST',
            path: '/',
            headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCloud9WorkspaceManagementService.GetEnvironmentConfig'
            },
            body: '{"staticPrefix":"https://d3gac9ws0uwh3y.cloudfront.net/c9-4.1.0-d04633a7-ide","environmentId":"' + environmentId + '"}'
        }, aws_creds);

        console.log("Requesting environment info...");
        request.post({
            url: "https://" + awsreq.hostname + awsreq.path,
            headers: awsreq.headers,
            body: awsreq.body,
            proxy: Utils.GetProxy()
        }, function(err, httpResponse, env_config) {
            activeEnvironmentInfo = JSON.parse(JSON.parse(env_config)['config']);
            console.log(activeEnvironmentInfo);

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
            }, aws_creds);

            console.log("Requesting token...");
            request.post({
                url: "https://" + awsreq.hostname + awsreq.path,
                headers: awsreq.headers,
                body: awsreq.body,
                proxy: Utils.GetProxy()
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
                    body: '{"version":13,"token":' + env_token + '}',
                    proxy: Utils.GetProxy()
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
                        },
                        proxy: Utils.GetProxy()
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
                            },
                            proxy: Utils.GetProxy()
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
                                body: '46:4{"type":"handshake","seq":20000,"version":13}',
                                proxy: Utils.GetProxy()
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
                                    },
                                    proxy: Utils.GetProxy()
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
                                        body: '14:4{"ack":10000}',
                                        proxy: Utils.GetProxy()
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
                                            body: '48:4{"ack":10000,"seq":20001,"d":["ready",{"$":1}]}',
                                            proxy: Utils.GetProxy()
                                        }, function(err, httpResponse, body) {
                                            console.log("48:4 POST returned");
                                            console.log(body);

                                            fileManager.xauth = xauth;
                                            fileManager.cookieJar = cookieJar;
                                            fileManager.environmentId = environmentId;
                                            websocketProvider.connect(vfsid, xauth, sid, cookieJar, environmentId, activeEnvironmentInfo);
                                        });
                                    });
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
        } else {
            environmentProvider.getChildren().then((envs) => {
                envs.forEach(env => {
                    if (env.id == connectedEnvironment.id) {
                        env.setConnected();
                    }
                });
                environmentProvider.refresh();
                resolve();
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
                            "docId": Utils.GetShortFilePath(event.textEditor.document),
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
    watcherEventListeners.forEach(watcherEventListener => {
        watcherEventListener.dispose();
    });
    watcherEventListeners = [];

    extensionConfig = vscode.workspace.getConfiguration('cloud9sync');
    let syncStrategy = extensionConfig.get('syncStrategy');

    watcher = vscode.workspace.createFileSystemWatcher("**");
    watcher.ignoreChangeEvents = false;
    watcher.ignoreCreateEvents = false;
    watcher.ignoreDeleteEvents = false;

    watcher.onDidChange((event) => {
        if (syncStrategy == "bidirectional") {
            console.log(event);
            fs.stat(event.fsPath, (err, fstat) => {
                if (fstat.isDirectory()) {
                    fileManager.recursiveUpload(Utils.GetShortFilePathByUri(event));
                    // fileManager.remoteRename available
                    // TODO: Check
                } else if (fstat.isFile()) {
                    fileManager.uploadExistingFile(Utils.GetShortFilePathByUri(event), fs.readFileSync(event.fsPath));
                }
            });
        }
    });
    watcher.onDidCreate((event) => {
        if (syncStrategy == "bidirectional") {
            console.log(event);
            fs.stat(event.fsPath, (err, fstat) => {
                if (fstat.isDirectory()) {
                    fileManager.uploadNewFile(Utils.GetShortFilePathByUri(event) + "/");
                } else if (fstat.isFile()) {
                    fileManager.uploadNewFile(Utils.GetShortFilePathByUri(event));
                    // TODO: Handle dirs
                }
            });
        }
    });
    watcher.onDidDelete((event) => {
        if (syncStrategy == "bidirectional") {
            console.log(event);
            fileManager.remoteDeleteDirectoryRecursive(Utils.GetShortFilePathByUri(event));
            fileManager.deleteRemoteFile(Utils.GetShortFilePathByUri(event));
        }
    });

    watcherEventListeners.push(watcher);

    watcherEventListeners.push(vscode.window.onDidChangeVisibleTextEditors(function(evt) {
        let newVisibleDocuments = [];
        evt.forEach(visibleEditors => {
            console.log("new visible document: " + Utils.GetShortFilePath(visibleEditors.document));
            newVisibleDocuments.push(Utils.GetShortFilePath(visibleEditors.document));
        });
    
        newVisibleDocuments.forEach(newVisibleDocument => {
            if (!visibleDocuments.includes(newVisibleDocument)) {
                console.log("Joining new document: " + newVisibleDocument);
                join_doc_chunks = [];
                websocketProvider.send_ch4_message(
                    ["call","collab","send",[vfsid,{"type": "JOIN_DOC","data": {
                        "docId": newVisibleDocument,
                        "reqId": Math.floor(9007199254740992*Math.random())
                    }}]]
                );
                websocketProvider.send_ch4_message(
                    ["watch", newVisibleDocument, {}, {$: websocketProvider.next_event_id()}]
                );
            }
        });
        visibleDocuments.forEach(visibleDocument => {
            if (!newVisibleDocuments.includes(visibleDocument)) {
                console.log("Leaving document: " + visibleDocument);
                websocketProvider.send_ch4_message(
                    ["call","collab","send",[vfsid,{"type":"LEAVE_DOC","data":{
                        "docId": visibleDocument
                    }}]]
                );
            }
        });

        visibleDocuments = newVisibleDocuments;
    }));

    watcherEventListeners.push(vscode.workspace.onDidChangeTextDocument(function(evt) {
        evt.contentChanges.forEach(change => {
            // TODO: Check if path is relevant
            editManager.processTextDocumentChange(change, evt);
        });
    }));

    console.log("Watchers started...");
}
