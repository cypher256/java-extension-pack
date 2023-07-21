/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import _ = require('lodash');
import which = require('which');

export const log: vscode.LogOutputChannel = vscode.window.createOutputChannel('Auto Config Java', {log:true});

export namespace OS {
	let _locale = 'en';
	try {
		_locale = JSON.parse(process.env.VSCODE_NLS_CONFIG!)?.osLocale.toLowerCase() ?? _locale;
	} catch (error) {
		log.info('Failed get osLocale', error);
	}
	export const locale = _locale;
	export const isWindows = process.platform === 'win32';
	export const isMac = process.platform === 'darwin';
	export const isLinux = process.platform === 'linux';
}

export let context: vscode.ExtensionContext;
export function init(_context: vscode.ExtensionContext) {
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

export async function whichPath(cmd:string) {
	try {
		return await which(cmd);
	} catch (error) {
		log.info('which check:', error);
		return undefined;
	}
}

export function existsFile(p:string) {
	return fs.existsSync(p) && fs.statSync(p).isFile();
}

export function existsDirectory(p:string) {
	return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

export function readString(file:string): string | undefined {
	return existsFile(file) ? fs.readFileSync(file).toString() : undefined;
}

export function rmQuietly(p:string) {
	fs.rm(p, {recursive: true, force: true}, e => {
		if (e) {
			log.info('Failed rm:', e); // Silent
		}
	});
}

export function rmSyncQuietly(p:string) {
	try {
		fs.rmSync(p, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync:', e); // Silent
	}
}

export function mkdirSyncQuietly(p:string): boolean {
	try {
		if (!fs.existsSync(p)) {
			fs.mkdirSync(p, {recursive: true});
			return true;
		}
	} catch (e) {
		log.info('Failed mkdirSync:', e); // Silent
	}
	return false;
}
