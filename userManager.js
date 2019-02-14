"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UserManager {
    constructor() {
        this.clients = {};
        this.ignoredclients = [];
    }
    setPosition(clientId, fileName, document, range, isReversed) {
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
    removeClient(clientId) {
        delete this.clients[clientId];
    }
    addIgnoredClient(clientid) {
        this.ignoredclients.push(clientid);
    }
}
exports.UserManager = UserManager;
