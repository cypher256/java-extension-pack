/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

export namespace JdkBundle {

	export interface JavaRuntime {
		name: string;
		path: string;
		default?: boolean;
	}

	export function runtimeName(javaVersion:number): string {
		return 'JavaSE-' + (javaVersion <= 8 ? '1.' + javaVersion : javaVersion);
	}

	export function isScanedJdk(runtime:JavaRuntime, context:vscode.ExtensionContext): boolean {
		const runtimePath = path.normalize(runtime.path);
		const userDir = path.normalize(context.globalStorageUri.fsPath);
		return !runtimePath.startsWith(userDir);
	}

	export function rmSync(path:string, options?:object): void {
		try {
			if (fs.existsSync(path)) {
				fs.rmSync(path, options);
			}
		} catch (e) {
			JdkBundle.log('Failed rmSync: ' + e);
		}
	}
	
	export function log(message?: any, ...optionalParams: any[]): void {
		console.log(`[Pleiades]`, message, ...optionalParams);
	}

	export function isLowerLeft(leftVersion:string, rightVersion:string): boolean {
		try {
			return semver.lt(
				leftVersion.replace(/_/g, '+'), 
				rightVersion.replace(/_/g, '+')
			);
		} catch (e) {
			JdkBundle.log('Failed isLowerLeft: ' + e);
			return false;
		}
	}
	
	export class OsArch {
	
		public isTarget(): boolean {
			return process.platform.match(/^(win32|darwin)$/) !== null || 
				(process.platform === 'linux' && process.arch === 'x64');
		}

		public isMac(): boolean {
			return process.platform === 'darwin';
		}

		public isWindows(): boolean {
			return process.platform === 'win32';
		}
	
		public getName(javaVersion: number): string {
			if (!this.isTarget()) {
				throw new Error(`Unsupported OS architecture. ${process.platform} ${process.arch}`);
			}
			if (process.platform === 'darwin') {
				if (process.arch === 'arm64' && javaVersion >= 11) {
					return 'aarch64_mac_hotspot';
				} else {
					return 'x64_mac_hotspot';
				}
			} else if (process.platform === 'linux') {
				return 'x64_linux_hotspot';
			}
			return 'x64_windows_hotspot';
		}
	}
}
