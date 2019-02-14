"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const Utils = require("./utils");
class PendingEdit {
    constructor() {
        this.action_list = [];
    }
    getActionListItemLength(i) {
        if (this.action_list[i][0] == "r")
            return parseInt(this.action_list[i].substring(1));
        return (this.action_list[i].length - 1);
    }
    splitActionListItem(i, cutpoint) {
        if (this.action_list[i][0] == "r") {
            let new_item = "r" + (parseInt(this.action_list[i].substring(1)) - cutpoint);
            this.action_list[i] = "r" + cutpoint;
            this.action_list.splice(i + 1, 0, new_item);
        }
        if (this.action_list[i][0] == "d") {
            let new_item = "d" + (this.action_list[i].substring(1 + cutpoint));
            this.action_list[i] = this.action_list[i].substring(0, cutpoint + 1);
            this.action_list.splice(i + 1, 0, new_item);
        }
        if (this.action_list[i][0] == "i") {
            let new_item = "i" + (this.action_list[i].substring(1 + cutpoint));
            this.action_list[i] = this.action_list[i].substring(0, cutpoint + 1);
            this.action_list.splice(i + 1, 0, new_item);
        }
    }
    addEdit(r, d, i) {
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
            let offset = 0;
            let index = 0;
            if (r) {
                let array_split_done = false;
                while (!array_split_done) {
                    if (index >= this.action_list.length) {
                        this.action_list.push("r" + (r - offset));
                        array_split_done = true;
                    }
                    else if (this.getActionListItemLength(index) > (r - offset)) {
                        // split
                        this.splitActionListItem(index, (r - offset));
                        array_split_done = true;
                    }
                    else {
                        offset += this.getActionListItemLength(index);
                        index += 1;
                    }
                }
            }
            if (d) {
                index += 1;
                this.action_list.splice(index, 0, ("d" + d));
                let remaining_delete_length = d.length;
                let index_offset = 1;
                while (remaining_delete_length > this.getActionListItemLength(index + index_offset)) {
                    this.action_list.splice(index + index_offset, 1);
                    remaining_delete_length -= this.getActionListItemLength(index + index_offset);
                    index_offset += 1;
                }
                if (remaining_delete_length > 0) {
                    if (this.action_list[index + index_offset][0] == 'r') {
                        this.action_list[index + index_offset] = "r" + (parseInt(this.action_list[index + index_offset].substring(1)) - remaining_delete_length);
                    }
                    else { // TODO: how does 2x 'd' work here?
                        this.action_list[index + index_offset] = this.action_list[index + index_offset][0] + this.action_list[index + index_offset].substring(remaining_delete_length + 1);
                    }
                }
            }
            if (i) {
                index += 1;
                this.action_list.splice(index, 0, ("i" + i));
            }
        }
        let index = 0;
        while (index < this.action_list.length) {
            if (this.action_list[index] == "r0") {
                this.action_list.splice(index, 1); // remove r0's
            }
            else {
                // TODO: check for double "i" or double "d"
                index += 1;
            }
        }
    }
    getEditList(prev_doc) {
        let ret = this.action_list;
        let remaining_chars = prev_doc.length;
        this.action_list.forEach(item => {
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
    }
    empty() {
        this.action_list = [];
    }
    isEmpty() {
        return this.action_list.length == 0;
    }
}
class EditManager {
    constructor(eventEmitter, websocketProvider) {
        this.eventEmitter = eventEmitter;
        this.websocketProvider = websocketProvider;
        this.pending_edit = new PendingEdit();
        this.last_unacknowledged_edit = null;
        this.lastKnownRemoteDocumentText = {};
        this.lastKnownLocalDocumentText = {};
        this.recent_edits = {};
        this.recent_edits_iterator = 0;
        eventEmitter.on('ack', (ack) => {
            if (this.last_unacknowledged_edit != null) {
                if (ack >= this.last_unacknowledged_edit) {
                    this.last_unacknowledged_edit = null;
                    this.sendPendingEdits();
                }
            }
        });
    }
    sendPendingEdits() {
        if (this.pending_edit.isEmpty()) {
            return;
        }
        console.log("SENDING PENDING EDITS");
        setTimeout(() => {
            let prev_text = this.lastKnownRemoteDocumentText[this.doc_path];
            let edit = this.pending_edit.getEditList(prev_text);
            this.pending_edit.empty();
            this.revNum += 1;
            let doc = vscode.window.activeTextEditor.document; // TODO: Not compensating for multi-doc
            let selection = vscode.window.activeTextEditor.selection;
            let seq = this.websocketProvider.send_ch4_message(["call", "collab", "send", [this.vfsid, { "type": "EDIT_UPDATE", "data": { "docId": this.doc_path, "op": edit, "revNum": this.revNum, "selection": [
                                selection.start.line,
                                selection.start.character,
                                selection.end.line,
                                selection.end.character,
                                selection.isReversed
                            ] } }]]);
            this.last_unacknowledged_edit = seq;
            this.lastKnownRemoteDocumentText[this.doc_path] = this.lastKnownLocalDocumentText[this.doc_path];
        }, 1); // TODO: Fix bad selection hack
    }
    queuePendingEdit(r, d, i) {
        this.pending_edit.addEdit(parseInt(r), d, i);
    }
    addRemoteEdit(edit) {
        this.recent_edits[this.recent_edits_iterator] = edit;
        setTimeout((recent_edits_iterator) => {
            delete this.recent_edits[recent_edits_iterator];
        }, 100, this.recent_edits_iterator); // TODO: Check/optimize this timeout
        this.recent_edits_iterator += 1;
    }
    processTextDocumentChange(change, evt) {
        if (Object.keys(this.recent_edits).length === 0 && this.recent_edits.constructor === Object) {
            ; // no recent edits
        }
        else {
            for (var i in this.recent_edits) {
                let text_edits = this.recent_edits[i];
                text_edits.forEach(textedit => {
                    if (textedit.range.contains(evt.document.positionAt(change.rangeOffset))) {
                        console.log("RECENT EDIT DETECTED, IGNORING ONDIDCHANGE TRIGGER");
                        delete this.recent_edits[i];
                        return;
                    }
                });
            }
        }
        console.log("NON REMOTE EDIT");
        let path = Utils.GetShortFilePath(evt.document);
        this.doc_path = path; // TODO: Check for changes to this
        let prevText = this.lastKnownLocalDocumentText[path];
        if (prevText === undefined) {
            console.warn("undefined lastKnownLocalDocumentText for: " + path);
            console.log(this.lastKnownLocalDocumentText);
            return;
        }
        this.lastKnownLocalDocumentText[path] = evt.document.getText();
        let delText = prevText.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
        this.queuePendingEdit((change.rangeOffset != 0 ? change.rangeOffset.toString() : null), (change.rangeLength > 0 ? delText : null), (change.text.length > 0 ? change.text : null));
        console.log("Queued pending");
        if (this.last_unacknowledged_edit == null) {
            this.sendPendingEdits();
        }
    }
}
exports.EditManager = EditManager;
