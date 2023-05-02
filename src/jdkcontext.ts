/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';

export const log: vscode.LogOutputChannel = vscode.window.createOutputChannel("JDK Auto", {log:true});

export namespace OS {
	export const isWindows = process.platform === 'win32';
	export const isMac = process.platform === 'darwin';
	export const isLinux = process.platform === 'linux';
}

export let context: vscode.ExtensionContext;
export function init(_context: vscode.ExtensionContext): void {
	context = _context;
}

export function getGlobalStoragePath(): string {
	if (!context) {throw new Error('context is not initialized');}
	return context.globalStorageUri.fsPath;
}

export function rmSync(p:string): void {
	try {
		fs.rmSync(p, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync: ' + e);
	}
}

export function mkdirSync(p:string): void {
	try {
		if (!fs.existsSync(p)) {
			fs.mkdirSync(p, {recursive: true});
		}
	} catch (e) {
		log.info('Failed mkdirSync: ' + e);
	}
}
