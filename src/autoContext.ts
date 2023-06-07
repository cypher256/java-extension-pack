/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as decompress from 'decompress';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import _ = require('lodash');
import which = require('which');

export const log: vscode.LogOutputChannel = vscode.window.createOutputChannel("JDK Auto", {log:true});

export namespace OS {
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

export function rm(p:string) {
	fs.rm(p, {recursive: true, force: true}, e => {
		if (e) {
			log.info('Failed rm: ', e); // Silent
		}
	});
}

export function rmSync(p:string) {
	try {
		fs.rmSync(p, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync: ' + e); // Silent
	}
}

export function mkdirSync(p:string) {
	try {
		if (!fs.existsSync(p)) {
			fs.mkdirSync(p, {recursive: true});
		}
	} catch (e) {
		log.info('Failed mkdirSync: ' + e); // Silent
	}
}

export async function whichPath(cmd:string) {
	try {
		return await which(cmd);
	} catch (error) {
		return undefined;
	}
}

export async function download(
	downloadUrl:string,
	downloadedFile:string,
	progress:vscode.Progress<any>,
	messageLabel:string) {

	log.info(`Downloading ${messageLabel}...`, downloadUrl);
	const msg = `JDK Auto: ${l10n.t('Downloading')} ${messageLabel}`;
	progress.report({message: msg});
	mkdirSync(path.dirname(downloadedFile));
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});

	const DOWNLOAD_MSG_KEY = 'DOWNLOAD_MSG_KEY';
	const state = context.workspaceState;
	const totalLength = res.headers['content-length'];
	if (totalLength) {
		let currentLength = 0;
		res.data.on('data', (chunk: Buffer) => {
			const prevMsg = state.get(DOWNLOAD_MSG_KEY);
			if (prevMsg && prevMsg !== msg) {
				return;
			}
			state.update(DOWNLOAD_MSG_KEY, msg);
			currentLength += chunk.length;
			const percent = Math.floor((currentLength / totalLength) * 100);
			progress.report({message: `${msg} (${percent}%)`});
		});
	}
	try {
		res.data.pipe(writer);
		await promisify(stream.finished)(writer);
	} finally {
		state.update(DOWNLOAD_MSG_KEY, undefined);
	}
}

export async function extract(
	downloadedFile:string,
	versionDir:string,
	progress:vscode.Progress<any>,
	messageLabel:string) {

	log.info(`Installing ${messageLabel}...`, versionDir);
	progress.report({ message: `JDK Auto: ${l10n.t('Installing')} ${messageLabel}` });
	rmSync(versionDir);
	try {
		await decompress(downloadedFile, path.join(versionDir, '..'), {
			map: file => {
				file.path = file.path.replace(/^[^/]+/, path.basename(versionDir));
				if (OS.isMac) { // for macOS JDK
					file.path = file.path.replace(/^(\d+\/)Contents\/Home\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		log.info('Failed extract: ' + e); // Validate later
	}
}
