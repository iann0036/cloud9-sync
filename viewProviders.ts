import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class User extends vscode.TreeItem {

	constructor(
		public readonly userid: string,
		public name: string,
		public state: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(name, collapsibleState);
	}

	get tooltip(): string {
		return `${this.name} (${this.state})`
	}

	setState(state: string): void {
		this.state = state;
		this.iconPath = path.join(__filename, '..', 'resources', 'icons', state + '.png');
	}

	iconPath = path.join(__filename, '..', 'resources', 'icons', this.state + '.png');

	contextValue = 'user';
}

export class UserProvider implements vscode.TreeDataProvider<User> {

	private _onDidChangeTreeData: vscode.EventEmitter<User | undefined> = new vscode.EventEmitter<User | undefined>();
	readonly onDidChangeTreeData: vscode.Event<User | undefined> = this._onDidChangeTreeData.event;

	private users: User[]

	constructor() {
		this.users = [
			/*new User("You", "online", vscode.TreeItemCollapsibleState.None, {
				command: 'cloud9sync.openPackageOnNpm',
				title: 'Something',
				arguments: []
			})*/
		];
	}

	addUser(userid: string, name: string, state: string): void {
		let user = new User(userid, name, state, vscode.TreeItemCollapsibleState.None);
		this.users.push(user);
		this.refresh();
	}

	setUserState(userid: string, state: string): void {
		this.users.forEach(user => {
			if (user.userid == userid) {
				user.setState(state);
			}
		});
		this.refresh();
	}

	clearAll(): void {
		this.users = [];
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: User): vscode.TreeItem {
		return element;
	}

	getChildren(element?: User): Thenable<User[]> {
		return new Promise(resolve => {
			resolve(this.users);
		});
	}
}

class Environment extends vscode.TreeItem {

	public label: string
	public state: string

	constructor(
		public id: string,
		public name: string,
		public description: string,
		public arn: string,
		public ownerArn: string,
		public type: string,
		public collapsibleState: vscode.TreeItemCollapsibleState,
		public command?: vscode.Command
	) {
		super(name, collapsibleState);
		this.label = name;
		this.state = "NOT_CONNECTED";
	}

	setConnecting(): void {
		this.state = "CONNECTING";
		this.contextValue = "connectingEnvironment";
		this.label = this.name + " (connecting)";
		//this.command = null;
	}

	setConnected(): void {
		this.state = "CONNECTED";
		this.contextValue = "connectedEnvironment";
		this.label = this.name + " (connected)";
		/*this.command = {
			command: 'cloud9sync.disconnect',
			title: 'Disconnect',
			arguments: []
		};*/
	}

	setSyncing(): void {
		this.state = "SYNCING";
		this.contextValue = "connectedEnvironment";
		this.label = this.name + " (syncing)";
		/*this.command = {
			command: 'cloud9sync.disconnect',
			title: 'Disconnect',
			arguments: []
		};*/
	}

	setNotConnected(): void {
		this.state = "NOT_CONNECTED";
		this.contextValue = "disconnectedEnvironment";
		this.label = this.name;
		/*this.command = {
			command: 'cloud9sync.connect',
			title: 'Connect',
			arguments: []
		};*/
	}

	get tooltip(): string {
		return `${this.label}`
	}

	iconPath = path.join(__filename, '..', 'resources', 'icons', 'env.png');

	contextValue = 'disconnectedEnvironment';
}

export class EnvironmentProvider implements vscode.TreeDataProvider<Environment> {

	private _onDidChangeTreeData: vscode.EventEmitter<Environment | undefined> = new vscode.EventEmitter<Environment | undefined>();
	readonly onDidChangeTreeData: vscode.Event<Environment | undefined> = this._onDidChangeTreeData.event;

	private envs: Environment[]

	constructor() {
		this.envs = [
			/*new Environment("MyEnv", vscode.TreeItemCollapsibleState.None, {
				command: 'cloud9sync.openPackageOnNpm',
				title: 'Something',
				arguments: []
			})*/
		]
	}

	addEnvironment(envobj: Object): void {
		let env = new Environment(envobj['id'], envobj['name'], envobj['description'],
		envobj['arn'], envobj['ownerArn'], envobj['type'], vscode.TreeItemCollapsibleState.None);
		this.envs.push(env);
		this.refresh();
	}

	clearAll(): void {
		this.envs = [];
		this.refresh();
	}

	disconnectAll(): void {
		console.warn("EXECUTING DISCONNECT");
		this.envs.forEach(env => {
			env.setNotConnected();
		});
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Environment): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Environment): Thenable<Environment[]> {
		return new Promise(resolve => {
			resolve(this.envs);
		});
	}
}

class Chat extends vscode.TreeItem {
	constructor(
		public mid: number,
		public userid: string,
		public name: string,
		public message: string,
		public timestamp: string
	) {
		super(name + ": " + message, vscode.TreeItemCollapsibleState.None);
	}

	get tooltip(): string {
		// this.timestamp
		return this.timestamp.toString(); // TODO: Fix me
	}

	iconPath = path.join(__filename, '..', 'resources', 'icons', 'chat.png');

	contextValue = 'chatItem';
}

export class ChatProvider implements vscode.TreeDataProvider<Chat> {

	private _onDidChangeTreeData: vscode.EventEmitter<Chat | undefined> = new vscode.EventEmitter<Chat | undefined>();
	readonly onDidChangeTreeData: vscode.Event<Chat | undefined> = this._onDidChangeTreeData.event;

	private chatitems: Chat[]

	constructor() {
		this.chatitems = [];
	}

	addChatItem(mid: number, userid: string, name: string, message: string, timestamp: string): void {
		let chat = new Chat(mid, userid, name, message, timestamp); // TODO: Prettify timestamp
		this.chatitems.push(chat);
		this.refresh();
	}

	clearAll(): void {
		this.chatitems = [];
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Chat): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Chat): Thenable<Chat[]> {
		return new Promise(resolve => {
			resolve(this.chatitems);
		});
	}
}
