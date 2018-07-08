"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var UserManager = /** @class */ (function () {
    function UserManager() {
        this.clients = {};
        this.ignoredclients = [];
    }
    UserManager.prototype.setPosition = function (clientId, fileName, document, range, isReversed) {
        var documentUri = document.uri.toString();
        var startOffset = document.offsetAt(range.start);
        var endOffset = document.offsetAt(range.end);
        this.clients[clientId] = {
            fileName: fileName,
            documentUri: documentUri,
            range: range,
            isReversed: isReversed,
            startOffset: startOffset,
            endOffset: endOffset
        };
    };
    UserManager.prototype.getPosition = function (clientId) {
        if (this.ignoredclients.includes(clientId))
            return null;
        return this.clients[clientId];
    };
    UserManager.prototype.removeClient = function (clientId) {
        delete this.clients[clientId];
    };
    UserManager.prototype.addIgnoredClient = function (clientid) {
        this.ignoredclients.push(clientid);
    };
    return UserManager;
}());
exports.UserManager = UserManager;
