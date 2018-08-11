import * as vscode from 'vscode';

export class UserManager {
    private clients;
    private ignoredclients;

    constructor() {
        this.clients = {};
        this.ignoredclients = [];
    }

    setPosition(clientId, fileName, document, range, isReversed): void {
        const documentUri = document.uri.toString();
        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);
        this.clients[clientId] = {
            fileName,
            documentUri,
            range,
            isReversed,
            startOffset,
            endOffset
        };
    }
    
    getPosition(clientId) {
        if (this.ignoredclients.includes(clientId))
            return null;
        
        return this.clients[clientId];
    }
    
    removeClient(clientId): void {
        delete this.clients[clientId];
    }

    addIgnoredClient(clientid): void {
        this.ignoredclients.push(clientid);
    }
}
