"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
class User extends vscode.TreeItem {
    constructor(userid, name, state, collapsibleState, command) {
        super(name, collapsibleState);
        this.userid = userid;
        this.name = name;
        this.state = state;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.iconPath = path.join(__filename, '..', 'resources', 'icons', this.state + '.png');
        this.contextValue = 'user';
    }
    get tooltip() {
        return `${this.name} (${this.state})`;
    }
    setState(state) {
        this.state = state;
        this.iconPath = path.join(__filename, '..', 'resources', 'icons', state + '.png');
    }
}
exports.User = User;
class UserProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.users = [
        /*new User("You", "online", vscode.TreeItemCollapsibleState.None, {
            command: 'cloud9sync.openPackageOnNpm',
            title: 'Something',
            arguments: []
        })*/
        ];
    }
    addUser(userid, name, state) {
        let user = new User(userid, name, state, vscode.TreeItemCollapsibleState.None);
        this.users.push(user);
        this.refresh();
    }
    setUserState(userid, state) {
        this.users.forEach(user => {
            if (user.userid == userid) {
                user.setState(state);
            }
        });
        this.refresh();
    }
    clearAll() {
        this.users = [];
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        return new Promise(resolve => {
            resolve(this.users);
        });
    }
}
exports.UserProvider = UserProvider;
class Environment extends vscode.TreeItem {
    constructor(id, name, description, arn, ownerArn, type, collapsibleState, command) {
        super(name, collapsibleState);
        this.id = id;
        this.name = name;
        this.description = description;
        this.arn = arn;
        this.ownerArn = ownerArn;
        this.type = type;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.iconPath = path.join(__filename, '..', 'resources', 'icons', 'env.png');
        this.contextValue = 'disconnectedEnvironment';
        this.label = name;
        this.state = "NOT_CONNECTED";
    }
    setConnecting() {
        this.state = "CONNECTING";
        this.contextValue = "connectingEnvironment";
        this.label = this.name + " (connecting)";
        //this.command = null;
    }
    setConnected() {
        this.state = "CONNECTED";
        this.contextValue = "connectedEnvironment";
        this.label = this.name + " (connected)";
        /*this.command = {
            command: 'cloud9sync.disconnect',
            title: 'Disconnect',
            arguments: []
        };*/
    }
    setSyncing() {
        this.state = "SYNCING";
        this.contextValue = "connectedEnvironment";
        this.label = this.name + " (syncing)";
        /*this.command = {
            command: 'cloud9sync.disconnect',
            title: 'Disconnect',
            arguments: []
        };*/
    }
    setNotConnected() {
        this.state = "NOT_CONNECTED";
        this.contextValue = "disconnectedEnvironment";
        this.label = this.name;
        /*this.command = {
            command: 'cloud9sync.connect',
            title: 'Connect',
            arguments: []
        };*/
    }
    get tooltip() {
        return `${this.label}`;
    }
}
class EnvironmentProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.envs = [
        /*new Environment("MyEnv", vscode.TreeItemCollapsibleState.None, {
            command: 'cloud9sync.openPackageOnNpm',
            title: 'Something',
            arguments: []
        })*/
        ];
    }
    addEnvironment(envobj) {
        let env = new Environment(envobj['id'], envobj['name'], envobj['description'], envobj['arn'], envobj['ownerArn'], envobj['type'], vscode.TreeItemCollapsibleState.None);
        this.envs.push(env);
        this.refresh();
    }
    clearAll() {
        this.envs = [];
        this.refresh();
    }
    disconnectAll() {
        console.warn("EXECUTING DISCONNECT");
        this.envs.forEach(env => {
            env.setNotConnected();
        });
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        return new Promise(resolve => {
            resolve(this.envs);
        });
    }
}
exports.EnvironmentProvider = EnvironmentProvider;
class Chat extends vscode.TreeItem {
    constructor(mid, userid, name, message, timestamp) {
        super(name + ": " + message, vscode.TreeItemCollapsibleState.None);
        this.mid = mid;
        this.userid = userid;
        this.name = name;
        this.message = message;
        this.timestamp = timestamp;
        this.iconPath = path.join(__filename, '..', 'resources', 'icons', 'chat.png');
        this.contextValue = 'chatItem';
    }
    get tooltip() {
        // this.timestamp
        return this.timestamp.toString(); // TODO: Fix me
    }
}
class ChatProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.chatitems = [];
    }
    addChatItem(mid, userid, name, message, timestamp) {
        let chat = new Chat(mid, userid, name, message, timestamp); // TODO: Prettify timestamp
        this.chatitems.push(chat);
        this.refresh();
    }
    removeChatItem(mid) {
        for (let i = 0; i < this.chatitems.length; i++) {
            if (this.chatitems[i].mid == mid) {
                this.chatitems.splice(i, 1);
            }
        }
        this.refresh();
    }
    clearAll() {
        this.chatitems = [];
        this.refresh();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        return new Promise(resolve => {
            resolve(this.chatitems);
        });
    }
}
exports.ChatProvider = ChatProvider;
