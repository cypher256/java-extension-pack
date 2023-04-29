/**
 * Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { compare } from 'compare-versions';

export const log: vscode.LogOutputChannel = vscode.window.createOutputChannel("JDK Auto", {log:true});
export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

export let context: vscode.ExtensionContext;
export function init(_context: vscode.ExtensionContext): void {
	context = _context;
}

export function getGlobalStoragePath(): string {
	if (!context) {throw new Error('context is not initialized');}
	return context.globalStorageUri.fsPath;
}

export function rmSync(path:string): void {
	try {
		fs.rmSync(path, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync: ' + e);
	}
}

export namespace download {

	export const isTarget = isWindows || isMac || (isLinux && process.arch === 'x64');

	export function archOf(javaVersion: number): string {
		if (isWindows) {
			return 'x64_windows_hotspot';
		} else if (isMac) {
			if (process.arch === 'arm64' && javaVersion >= 11) {
				return 'aarch64_mac_hotspot';
			} else {
				return 'x64_mac_hotspot';
			}
		} else {
			return 'x64_linux_hotspot';
		}
	}
}

export interface IConfigRuntime {
	name: string;
	path: string;
	default?: boolean;
}

export namespace runtime {

	export const CONFIG_KEY = 'java.configuration.runtimes';

	export function versionOf(runtimeName:string): number {
		return Number(runtimeName.replace(/^J(ava|2)SE-(1\.|)/, '')); // NaN if invalid
	}

	export function nameOf(majorVersion:number): string {
		if (majorVersion <= 5) {
			return 'J2SE-1.' + majorVersion;
		} else if (majorVersion <= 8) {
			return 'JavaSE-1.' + majorVersion;
		}
		return 'JavaSE-' + majorVersion;
	}

	export function getRedhatNames(): string[] {
		const redhatJava = vscode.extensions.getExtension('redhat.java'); // extensionDependencies
		const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
		const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
		if (redhatRuntimeNames.length === 0) {
			log.warn('Failed getExtension RedHat', redhatJava);
		}
		return redhatRuntimeNames;
	}

	export function getRedhatVersions(): number[] {
		return getRedhatNames().map(name => versionOf(name));
	}

	export function isUserInstalled(javaHome:string): boolean {
		const _javaHome = path.normalize(javaHome);
		const _globalStoragePath = path.normalize(getGlobalStoragePath());
		return !_javaHome.startsWith(_globalStoragePath);
	}

	export function isNewLeft(leftVersion:string, rightVersion:string): boolean {
		try {
			const optimize = (s:string) => s.replace(/_/g, '.');
			return compare(optimize(leftVersion), optimize(rightVersion), '>');
		} catch (e) {
			log.warn('Failed compare-versions: ' + e);
			return false;
		}
	}
}
