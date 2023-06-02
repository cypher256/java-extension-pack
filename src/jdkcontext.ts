/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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

export function isUserInstalled(checkDir:string): boolean {
	function _normalizePath (dir:string) {
		const d = path.normalize(dir);
		return OS.isWindows ? d.toLowerCase() : d;
	}
	const _checkDir = _normalizePath(checkDir);
	const _globalStoragePath = _normalizePath(getGlobalStoragePath());
	return !_checkDir.startsWith(_globalStoragePath);
}

export function rmSync(p:string): void {
	try {
		fs.rmSync(p, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync: ' + e); // Silent
	}
}

export function mkdirSync(p:string): void {
	try {
		if (!fs.existsSync(p)) {
			fs.mkdirSync(p, {recursive: true});
		}
	} catch (e) {
		log.info('Failed mkdirSync: ' + e); // Silent
	}
}
