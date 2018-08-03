"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var Utils = require("./utils");
var PendingEdit = /** @class */ (function () {
    function PendingEdit() {
        this.action_list = [];
    }
    PendingEdit.prototype.getActionListItemLength = function (i) {
        if (this.action_list[i][0] == "r")
            return parseInt(this.action_list[i].substring(1));
        return (this.action_list[i].length - 1);
    };
    PendingEdit.prototype.splitActionListItem = function (i, cutpoint) {
        if (this.action_list[i][0] == "r") {
            var new_item = "r" + (parseInt(this.action_list[i].substring(1)) - cutpoint);
            this.action_list[i] = "r" + cutpoint;
            this.action_list.splice(i + 1, 0, new_item);
        }
        if (this.action_list[i][0] == "d") {
            var new_item = "d" + (this.action_list[i].substring(1 + cutpoint));
            this.action_list[i] = this.action_list[i].substring(0, cutpoint + 1);
            this.action_list.splice(i + 1, 0, new_item);
        }
        if (this.action_list[i][0] == "i") {
            var new_item = "i" + (this.action_list[i].substring(1 + cutpoint));
            this.action_list[i] = this.action_list[i].substring(0, cutpoint + 1);
            this.action_list.splice(i + 1, 0, new_item);
        }
    };
    PendingEdit.prototype.addEdit = function (r, d, i) {
        console.log("Start Add Edit");
        if (this.action_list.length == 0) {
            if (r) {
                this.action_list.push("r" + r);
            }
            if (d) {
                this.action_list.push("d" + d);
            }
            if (i) {
                this.action_list.push("i" + i);
            }
        }
        else {
            var offset = 0;
            var index_1 = 0;
            if (r) {
                var array_split_done = false;
                while (!array_split_done) {
                    if (index_1 >= this.action_list.length) {
                        this.action_list.push("r" + (r - offset));
                        array_split_done = true;
                    }
                    else if (this.getActionListItemLength(index_1) > (r - offset)) {
                        // split
                        this.splitActionListItem(index_1, (r - offset));
                        array_split_done = true;
                    }
                    else {
                        offset += this.getActionListItemLength(index_1);
                        index_1 += 1;
                    }
                }
            }
            if (d) {
                index_1 += 1;
                this.action_list.splice(index_1, 0, ("d" + d));
                var remaining_delete_length = d.length;
                var index_offset = 1;
                while (remaining_delete_length > this.getActionListItemLength(index_1 + index_offset)) {
                    this.action_list.splice(index_1 + index_offset, 1);
                    remaining_delete_length -= this.getActionListItemLength(index_1 + index_offset);
                    index_offset += 1;
                }
                if (remaining_delete_length > 0) {
                    if (this.action_list[index_1 + index_offset][0] == 'r') {
                        this.action_list[index_1 + index_offset] = "r" + (parseInt(this.action_list[index_1 + index_offset].substring(1)) - remaining_delete_length);
                    }
                    else { // TODO: how does 2x 'd' work here?
                        this.action_list[index_1 + index_offset] = this.action_list[index_1 + index_offset][0] + this.action_list[index_1 + index_offset].substring(remaining_delete_length + 1);
                    }
                }
            }
            if (i) {
                index_1 += 1;
                this.action_list.splice(index_1, 0, ("i" + i));
            }
        }
        var index = 0;
        while (index < this.action_list.length) {
            if (this.action_list[index] == "r0") {
                this.action_list.splice(index, 1); // remove r0's
            }
            else {
                // TODO: check for double "i" or double "d"
                index += 1;
            }
        }
    };
    PendingEdit.prototype.getEditList = function (prev_doc) {
        var ret = this.action_list;
        var remaining_chars = prev_doc.length;
        this.action_list.forEach(function (item) {
            if (item[0] == "r") {
                remaining_chars -= parseInt(item.substring(1));
            }
            else if (item[0] == "d") {
                remaining_chars -= (item.length - 1);
            }
        });
        if (remaining_chars > 0) {
            ret.push("r" + remaining_chars); // TODO: This is broken
        }
        else if (remaining_chars < 0) {
            console.warn("Remaining chars = " + remaining_chars);
        }
        return ret;
    };
    PendingEdit.prototype.empty = function () {
        this.action_list = [];
    };
    PendingEdit.prototype.isEmpty = function () {
        return this.action_list.length == 0;
    };
    return PendingEdit;
}());
var EditManager = /** @class */ (function () {
    function EditManager(eventEmitter, websocketProvider) {
        var _this = this;
        this.eventEmitter = eventEmitter;
        this.websocketProvider = websocketProvider;
        this.pending_edit = new PendingEdit();
        this.last_unacknowledged_edit = null;
        this.lastKnownRemoteDocumentText = {};
        this.lastKnownLocalDocumentText = {};
        this.recent_edits = {};
        this.recent_edits_iterator = 0;
        eventEmitter.on('ack', function (ack) {
            if (_this.last_unacknowledged_edit != null) {
                if (ack >= _this.last_unacknowledged_edit) {
                    _this.last_unacknowledged_edit = null;
                    _this.sendPendingEdits();
                }
            }
        });
    }
    EditManager.prototype.sendPendingEdits = function () {
        var _this = this;
        if (this.pending_edit.isEmpty()) {
            return;
        }
        console.log("SENDING PENDING EDITS");
        setTimeout(function (pending_edit_l, prev_text) {
            _this.revNum += 1;
            var doc = vscode.window.activeTextEditor.document; // TODO: Not compensating for multi-doc
            var selection = vscode.window.activeTextEditor.selection;
            var edit = pending_edit_l.getEditList(prev_text);
            var seq = _this.websocketProvider.send_ch4_message(["call", "collab", "send", [_this.vfsid, { "type": "EDIT_UPDATE", "data": { "docId": Utils.GetShortFilePath(doc), "op": edit, "revNum": _this.revNum, "selection": [
                                selection.start.line,
                                selection.start.character,
                                selection.end.line,
                                selection.end.character,
                                selection.isReversed
                            ] } }]]);
            _this.last_unacknowledged_edit = seq;
            pending_edit_l.empty();
            _this.lastKnownRemoteDocumentText[Utils.GetShortFilePath(doc)] = _this.lastKnownLocalDocumentText[Utils.GetShortFilePath(doc)];
        }, 1, this.pending_edit, this.lastKnownRemoteDocumentText[Utils.GetShortFilePath(vscode.window.activeTextEditor.document)]); // TODO: Fix bad selection hack
    };
    EditManager.prototype.queuePendingEdit = function (r, d, i) {
        this.pending_edit.addEdit(parseInt(r), d, i);
    };
    EditManager.prototype.addRemoteEdit = function (edit) {
        var _this = this;
        this.recent_edits[this.recent_edits_iterator] = edit;
        setTimeout(function (recent_edits_iterator) {
            delete _this.recent_edits[recent_edits_iterator];
        }, 100, this.recent_edits_iterator); // TODO: Check/optimize this timeout
        this.recent_edits_iterator += 1;
    };
    EditManager.prototype.processTextDocumentChange = function (change, evt) {
        var _this = this;
        for (var i in this.recent_edits) {
            var text_edits = this.recent_edits[i];
            console.log(text_edits);
            text_edits.forEach(function (textedit) {
                if (textedit.range.contains(evt.document.positionAt(change.rangeOffset))) {
                    console.log("RECENT EDIT DETECTED, IGNORING ONDIDCHANGE TRIGGER");
                    delete _this.recent_edits[i];
                    return;
                }
            });
        }
        console.log("NON REMOTE EDIT");
        var path = Utils.GetShortFilePath(evt.document);
        var prevText = this.lastKnownLocalDocumentText[path];
        if (prevText === undefined) {
            console.warn("undefined lastKnownLocalDocumentText for: " + path);
            console.log(this.lastKnownLocalDocumentText);
            return;
        }
        this.lastKnownLocalDocumentText[path] = evt.document.getText();
        var delText = prevText.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
        this.queuePendingEdit((change.rangeOffset != 0 ? change.rangeOffset.toString() : null), (change.rangeLength > 0 ? delText : null), (change.text.length > 0 ? change.text : null));
        console.log("Queued pending");
        if (this.last_unacknowledged_edit == null) {
            this.sendPendingEdits();
        }
    };
    return EditManager;
}());
exports.EditManager = EditManager;
