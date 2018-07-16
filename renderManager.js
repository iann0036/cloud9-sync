"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vscode = require("vscode");
var Color = /** @class */ (function () {
    function Color(r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
    }
    return Color;
}());
var RenderManager = /** @class */ (function () {
    function RenderManager(clientId, name, userManager, color) {
        this.clientId = clientId;
        this.name = name;
        this.userManager = userManager;
        this.color = color;
        this.rangedecorator = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(' + this.color.r.toString() + ',' + this.color.g.toString() + ',' + this.color.b.toString() + ',0.3)',
            borderRadius: '0.1rem',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        this.cursordecorator = vscode.window.createTextEditorDecorationType({
            before: {
                color: 'rgba(' + this.color.r.toString() + ',' + this.color.g.toString() + ',' + this.color.b.toString() + ',1)',
                contentText: '|',
                margin: '0px 0px 0px -0.42ch',
                textDecoration: 'none; position: absolute; display: inline-block; top: 0; font-size: 135%; font-weight: bold; z-index: 1;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        // TODO: Fix missing cap when at end of file
        this.cursortopdecorator = vscode.window.createTextEditorDecorationType({
            before: {
                color: 'rgba(' + this.color.r.toString() + ',' + this.color.g.toString() + ',' + this.color.b.toString() + ',1)',
                contentText: '▀',
                margin: '-0.8ch 0px 0px -0.42ch',
                textDecoration: 'none; position: absolute; display: inline-block; top: 0; font-size: 80%; font-weight: bold; z-index: 1;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        this.clientdecorator = null;
    }
    RenderManager.prototype.getClientDecorator = function () {
        if (this.clientdecorator == null) {
            this.clientdecorator = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(' + this.color.r.toString() + ',' + this.color.g.toString() + ',' + this.color.b.toString() + ',1)',
                textDecoration: 'none; position: relative; z-index: 1;',
                after: {
                    backgroundColor: 'rgba(' + this.color.r.toString() + ',' + this.color.g.toString() + ',' + this.color.b.toString() + ',1)',
                    contentText: this.name,
                    textDecoration: 'none; position: absolute; display: inline-block; top: 1rem; font-size: 0.7rem; font-weight: bold; z-index: 1; border-radius: 0.15rem; padding: 0px 0.5ch; pointer-events: none; color: white;'
                },
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
            });
        }
        clearTimeout(this.clientdecoratortimeout);
        this.clientdecoratortimeout = setTimeout(function (renderManager) {
            renderManager.clientdecorator.dispose();
            renderManager.clientdecorator = null;
        }, 2000, this);
        return this.clientdecorator;
    };
    RenderManager.prototype.getLatestPosition = function () {
        var _this = this;
        this.position = this.userManager.getPosition(this.clientId);
        if (this.position) {
            vscode.window.visibleTextEditors.forEach(function (editor) {
                if (editor.document.uri.toString() == _this.position.documentUri) {
                    _this.editor = editor;
                }
            });
        }
        return this.position;
    };
    RenderManager.prototype.refresh = function () {
        if (!this.getLatestPosition())
            return;
        this.editor.setDecorations(this.rangedecorator, [{
                hoverMessage: new vscode.MarkdownString(this.name),
                range: this.position.range
            }]);
        this.editor.setDecorations(this.cursordecorator, [{
                range: (this.position.isReversed ?
                    new vscode.Range(this.position.range.start, this.position.range.start) :
                    new vscode.Range(this.position.range.end, this.position.range.end))
            }]);
        this.editor.setDecorations(this.cursortopdecorator, [{
                range: (this.position.isReversed ?
                    new vscode.Range(this.position.range.start, this.position.range.start) :
                    new vscode.Range(this.position.range.end, this.position.range.end))
            }]);
        this.editor.setDecorations(this.getClientDecorator(), [{
                range: (this.position.isReversed ?
                    new vscode.Range(this.position.range.start, this.position.range.start) :
                    new vscode.Range(this.position.range.end, this.position.range.end))
            }]);
    };
    RenderManager.prototype.destroy = function () {
        clearTimeout(this.clientdecoratortimeout);
        this.rangedecorator.dispose();
        this.cursordecorator.dispose();
        this.cursortopdecorator.dispose();
        this.clientdecorator.dispose();
    };
    return RenderManager;
}());
exports.RenderManager = RenderManager;
