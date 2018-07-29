import * as vscode from 'vscode'
import * as fs from 'fs'

export class Cloud9ContentProvider implements vscode.TextDocumentContentProvider {
    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
        const buffer = await this.readFile(uri)

        if (!buffer) {
            return
        }

        return buffer
    }

    readFile(uri: vscode.Uri): Promise<string> {
        const filepath = uri.with({ scheme: 'file' }).fsPath;
        
        return new Promise((resolve, reject) => {
            resolve("TODO");
        })
    }
}