/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as fs from 'fs';
import { GlobOptionsWithFileTypesUnset, glob } from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
import which = require('which');

/**
 * The output channel for the extension.
 */
export const log: vscode.LogOutputChannel = vscode.window.createOutputChannel('Auto Config Java', {log:true});

/**
 * A namespace for the OS information.
 */
export namespace OS {
	let _locale = 'en';
	try {
		_locale = JSON.parse(process.env.VSCODE_NLS_CONFIG!)?.osLocale.toLowerCase() ?? _locale;
	} catch (error) {
		log.info('Failed get osLocale', error);
	}
	export const locale = _locale;
	export const isWindows = process.platform === 'win32';
	export const isMac     = process.platform === 'darwin';
	export const isLinux   = process.platform === 'linux';
}

/**
 * The extension context.
 */
let extensionContext: vscode.ExtensionContext;

/**
 * Initializes the extension context.
 * @param _extensionContext The extension context.
 * @returns true if first startup.
 */
export function init(_extensionContext: vscode.ExtensionContext) {
	extensionContext = _extensionContext;
	const globalStoragePath = getGlobalStoragePath();
	const isFirstStartup = !existsDirectory(globalStoragePath);
	mkdirSyncQuietly(globalStoragePath);
	return isFirstStartup;
}

/**
 * @returns The extension context.
 */
export function getExtensionContext() {
	return extensionContext;
}

/**
 * @param optionalSubPaths The optional sub paths.
 * @returns The global storage path + optional sub paths.
 */
export function getGlobalStoragePath(...optionalSubPaths:string[]): string {
	if (!extensionContext) {throw new Error('context is not initialized');}
	let p = extensionContext.globalStorageUri.fsPath;
	// Match drive letter case to glob search results
	p = p.replace(/^([a-z])(:.*)/, (m, winDriveLetter:string, dir) => {
		return winDriveLetter.toUpperCase() + dir;
	});
	return path.join(p, ...optionalSubPaths);
}

/**
 * @param checkPath The path to check.
 * @returns true if checkPath is not included in the global storage path.
 */
export function isUserInstalled(checkPath:string): boolean {
	return !containsPath(getGlobalStoragePath(), checkPath);
}

/**
 * @param basePath The base path.
 * @param paths The paths to join.
 * @returns The joined path. undefined if basePath is undefined.
 */
export function joinPathIfPresent(basePath:string | undefined, ...paths:string[]) {
	if (!basePath) {return undefined;}
	return path.join(basePath, ...paths);
}

/**
 * @param basePath The base path.
 * @param subPath The sub path to check.
 * @returns true if subPath is included in basePath.
 */
export function containsPath(basePath:string, subPath:string | undefined): boolean {
	if (!subPath) {return false;}
	const _subPath = normalizePath(subPath);
	const _basePath = normalizePath(basePath);
	return _subPath.startsWith(_basePath);
}

/**
 * @param path1 The path1 to check.
 * @param path2 The path2 to check.
 * @returns true if path1 and path2 are equal.
 */
export function equalsPath(path1:string, path2:string | undefined): boolean {
	if (!path2) {return false;}
	const _path1 = normalizePath(path1);
	const _path2 = normalizePath(path2);
	return _path1 === _path2;
}

function normalizePath(dir:string) {
	const d = path.normalize(dir).replace(/[/\\]$/, ''); // Remove trailing slash
	return OS.isWindows ? d.toLowerCase() : d;
}

/**
 * Finds all instances of a specified executable in the PATH environment variable.
 * @param cmd The command to search for.
 * @returns The full path to the command.
 */
export async function whichPath(cmd:string) {
	try {
		return await which(cmd);
	} catch (error) {
		log.info('which check:', error);
		return undefined;
	}
}

/**
 * @param p The path.
 * @returns true if the path is a file.
 */
export function existsFile(p:string) {
	return fs.existsSync(p) && fs.statSync(p).isFile();
}

/**
 * @param p The path.
 * @returns true if the path is a directory.
 */
export function existsDirectory(p:string) {
	return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

/**
 * @param file The file path.
 * @returns The file content as string. undefined if not exists.
 */
export function readString(file:string): string | undefined {
	return existsFile(file) ? fs.readFileSync(file).toString() : undefined;
}

/**
 * @param p The path.
 * @returns The file modified date as string.
 */
export function getLastModified(p:string) {
	try {
		return fs.statSync(p).mtime.toLocaleDateString();
	} catch (e) {
		log.info('Failed statSync:', e); // Silent
		return undefined;
	}
}

/**
 * Remove directory recursively.
 * @param p The directory path.
 */
export function rmQuietly(p:string) {
	fs.rm(p, {recursive: true, force: true}, e => {
		if (e) {
			log.info('Failed rm:', e); // Silent
		}
	});
}

/**
 * Synchronous remove directory recursively.
 * @param p The directory path.
 */
export function rmSyncQuietly(p:string) {
	try {
		fs.rmSync(p, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync:', e); // Silent
	}
}

/**
 * Synchronous create directory recursively.
 * @param p The directory path.
 * @returns true if created.
 */
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

/**
 * Search paths by glob pattern.
 * @param pattern The glob pattern.
 * @param options The glob options.
 * @returns The found paths. Empty array if not found.
 */
export async function globSearch(
	pattern: string | string[],
	options?: GlobOptionsWithFileTypesUnset | undefined): Promise<string[]> {
	try {
		const pats = Array.isArray(pattern) ? pattern : [pattern];
		const slashGlobs = pats.map(p => p.replace(/\\/g, '/'));
		return await glob(slashGlobs, options);
	} catch (error) {
		log.info('glob error:', error); // Silent
		return [];
	}
}
