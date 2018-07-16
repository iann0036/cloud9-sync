import * as vscode from 'vscode';
import * as UserManager from './userManager';

class Color {
	constructor(
		public readonly r: number,
		public readonly g: number,
		public readonly b: number
	) {}
}

export class RenderManager {
	private editor
	private position
	private rangedecorator
	private cursordecorator
	private cursortopdecorator
	public clientdecorator // needed to be public?
	private clientdecoratortimeout

	constructor(
		public readonly clientId: string,
		public readonly name: string,
		public readonly userManager: UserManager.UserManager,
		public readonly color: Color
	) {
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

	getClientDecorator() {
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

		this.clientdecoratortimeout = setTimeout(function(renderManager){
			renderManager.clientdecorator.dispose();
			renderManager.clientdecorator = null;
		}, 2000, this);

		return this.clientdecorator;
	}

	getLatestPosition() {
		this.position = this.userManager.getPosition(this.clientId);
		
		if (this.position) {
			vscode.window.visibleTextEditors.forEach((editor) => {
				if (editor.document.uri.toString() == this.position.documentUri) {
					this.editor = editor;
				}
			});
		}

		return this.position;
	}

	refresh() {
		if (!this.getLatestPosition()) return;

		this.editor.setDecorations(
			this.rangedecorator,
			[{
				hoverMessage: new vscode.MarkdownString(this.name),
				range: this.position.range
			}]
		);

		this.editor.setDecorations(
			this.cursordecorator,
			[{
				range: (this.position.isReversed ?
					new vscode.Range(this.position.range.start, this.position.range.start) :
					new vscode.Range(this.position.range.end, this.position.range.end)
				)
			}]
		);

		this.editor.setDecorations(
			this.cursortopdecorator,
			[{
				range: (this.position.isReversed ?
					new vscode.Range(this.position.range.start, this.position.range.start) :
					new vscode.Range(this.position.range.end, this.position.range.end)
				)
			}]
		);

		this.editor.setDecorations(
			this.getClientDecorator(),
			[{
				range: (this.position.isReversed ?
					new vscode.Range(this.position.range.start, this.position.range.start) :
					new vscode.Range(this.position.range.end, this.position.range.end)
				)
			}]
		);
	}

	destroy() {
		clearTimeout(this.clientdecoratortimeout);
		this.rangedecorator.dispose();
		this.cursordecorator.dispose();
		this.cursortopdecorator.dispose();
		this.clientdecorator.dispose();
	}
}