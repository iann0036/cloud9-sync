"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
class Cloud9ContentProvider {
    provideTextDocumentContent(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            const buffer = yield this.readFile(uri);
            if (!buffer) {
                return;
            }
            return buffer;
        });
    }
    readFile(uri) {
        const filepath = uri.with({ scheme: 'file' }).fsPath;
        return new Promise((resolve, reject) => {
            resolve("TODO");
        });
    }
}
exports.Cloud9ContentProvider = Cloud9ContentProvider;
