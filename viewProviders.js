"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var path = require("path");
var User = /** @class */ (function (_super) {
    __extends(User, _super);
    function User(userid, name, state, collapsibleState, command) {
        var _this = _super.call(this, name, collapsibleState) || this;
        _this.userid = userid;
        _this.name = name;
        _this.state = state;
        _this.collapsibleState = collapsibleState;
        _this.command = command;
        _this.iconPath = path.join(__filename, '..', 'resources', 'icons', _this.state + '.png');
        _this.contextValue = 'user';
        return _this;
    }
    Object.defineProperty(User.prototype, "tooltip", {
        get: function () {
            return this.name + " (" + this.state + ")";
        },
        enumerable: true,
        configurable: true
    });
    User.prototype.setState = function (state) {
        this.state = state;
        this.iconPath = path.join(__filename, '..', 'resources', 'icons', state + '.png');
    };
    return User;
}(vscode.TreeItem));
exports.User = User;
var UserProvider = /** @class */ (function () {
    function UserProvider() {
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
    UserProvider.prototype.addUser = function (userid, name, state) {
        var user = new User(userid, name, state, vscode.TreeItemCollapsibleState.None);
        this.users.push(user);
        this.refresh();
    };
    UserProvider.prototype.setUserState = function (userid, state) {
        this.users.forEach(function (user) {
            if (user.userid == userid) {
                user.setState(state);
            }
        });
        this.refresh();
    };
    UserProvider.prototype.clearAll = function () {
        this.users = [];
        this.refresh();
    };
    UserProvider.prototype.refresh = function () {
        this._onDidChangeTreeData.fire();
    };
    UserProvider.prototype.getTreeItem = function (element) {
        return element;
    };
    UserProvider.prototype.getChildren = function (element) {
        var _this = this;
        return new Promise(function (resolve) {
            resolve(_this.users);
        });
    };
    return UserProvider;
}());
exports.UserProvider = UserProvider;
var Environment = /** @class */ (function (_super) {
    __extends(Environment, _super);
    function Environment(id, name, description, arn, ownerArn, type, collapsibleState, command) {
        var _this = _super.call(this, name, collapsibleState) || this;
        _this.id = id;
        _this.name = name;
        _this.description = description;
        _this.arn = arn;
        _this.ownerArn = ownerArn;
        _this.type = type;
        _this.collapsibleState = collapsibleState;
        _this.command = command;
        _this.iconPath = path.join(__filename, '..', 'resources', 'icons', 'env.png');
        _this.contextValue = 'disconnectedEnvironment';
        _this.label = name;
        _this.state = "NOT_CONNECTED";
        return _this;
    }
    Environment.prototype.setConnecting = function () {
        this.state = "CONNECTING";
        this.contextValue = "connectingEnvironment";
        this.label = this.name + " (connecting)";
        //this.command = null;
    };
    Environment.prototype.setConnected = function () {
        this.state = "CONNECTED";
        this.contextValue = "connectedEnvironment";
        this.label = this.name + " (connected)";
        /*this.command = {
            command: 'cloud9sync.disconnect',
            title: 'Disconnect',
            arguments: []
        };*/
    };
    Environment.prototype.setSyncing = function () {
        this.state = "SYNCING";
        this.contextValue = "connectedEnvironment";
        this.label = this.name + " (syncing)";
        /*this.command = {
            command: 'cloud9sync.disconnect',
            title: 'Disconnect',
            arguments: []
        };*/
    };
    Environment.prototype.setNotConnected = function () {
        this.state = "NOT_CONNECTED";
        this.contextValue = "disconnectedEnvironment";
        this.label = this.name;
        /*this.command = {
            command: 'cloud9sync.connect',
            title: 'Connect',
            arguments: []
        };*/
    };
    Object.defineProperty(Environment.prototype, "tooltip", {
        get: function () {
            return "" + this.label;
        },
        enumerable: true,
        configurable: true
    });
    return Environment;
}(vscode.TreeItem));
var EnvironmentProvider = /** @class */ (function () {
    function EnvironmentProvider() {
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
    EnvironmentProvider.prototype.addEnvironment = function (envobj) {
        var env = new Environment(envobj['id'], envobj['name'], envobj['description'], envobj['arn'], envobj['ownerArn'], envobj['type'], vscode.TreeItemCollapsibleState.None);
        this.envs.push(env);
        this.refresh();
    };
    EnvironmentProvider.prototype.clearAll = function () {
        this.envs = [];
        this.refresh();
    };
    EnvironmentProvider.prototype.disconnectAll = function () {
        console.warn("EXECUTING DISCONNECT");
        this.envs.forEach(function (env) {
            env.setNotConnected();
        });
        this.refresh();
    };
    EnvironmentProvider.prototype.refresh = function () {
        this._onDidChangeTreeData.fire();
    };
    EnvironmentProvider.prototype.getTreeItem = function (element) {
        return element;
    };
    EnvironmentProvider.prototype.getChildren = function (element) {
        var _this = this;
        return new Promise(function (resolve) {
            resolve(_this.envs);
        });
    };
    return EnvironmentProvider;
}());
exports.EnvironmentProvider = EnvironmentProvider;
var Chat = /** @class */ (function (_super) {
    __extends(Chat, _super);
    function Chat(mid, userid, name, message, timestamp) {
        var _this = _super.call(this, name + ": " + message, vscode.TreeItemCollapsibleState.None) || this;
        _this.mid = mid;
        _this.userid = userid;
        _this.name = name;
        _this.message = message;
        _this.timestamp = timestamp;
        _this.iconPath = path.join(__filename, '..', 'resources', 'icons', 'chat.png');
        _this.contextValue = 'chatItem';
        return _this;
    }
    Object.defineProperty(Chat.prototype, "tooltip", {
        get: function () {
            // this.timestamp
            return this.timestamp.toString(); // TODO: Fix me
        },
        enumerable: true,
        configurable: true
    });
    return Chat;
}(vscode.TreeItem));
var ChatProvider = /** @class */ (function () {
    function ChatProvider() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.chatitems = [];
    }
    ChatProvider.prototype.addChatItem = function (mid, userid, name, message, timestamp) {
        var chat = new Chat(mid, userid, name, message, timestamp); // TODO: Prettify timestamp
        this.chatitems.push(chat);
        this.refresh();
    };
    ChatProvider.prototype.removeChatItem = function (mid) {
        for (var i = 0; i < this.chatitems.length; i++) {
            if (this.chatitems[i].mid == mid) {
                this.chatitems.splice(i, 1);
            }
        }
        this.refresh();
    };
    ChatProvider.prototype.clearAll = function () {
        this.chatitems = [];
        this.refresh();
    };
    ChatProvider.prototype.refresh = function () {
        this._onDidChangeTreeData.fire();
    };
    ChatProvider.prototype.getTreeItem = function (element) {
        return element;
    };
    ChatProvider.prototype.getChildren = function (element) {
        var _this = this;
        return new Promise(function (resolve) {
            resolve(_this.chatitems);
        });
    };
    return ChatProvider;
}());
exports.ChatProvider = ChatProvider;
