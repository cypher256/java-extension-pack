/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { compare } from 'compare-versions';

export namespace jdkbundle {

	export interface JavaRuntime {
		name: string;
		path: string;
		default?: boolean;
	}

	export namespace runtime {

		export function versionOf(runtimeName:string): number {
			return Number(runtimeName.replace(/^JavaSE-(1\.|)/, ''));
		}

		export function nameOf(javaVersion:number): string {
			return 'JavaSE-' + (javaVersion <= 8 ? '1.' + javaVersion : javaVersion);
		}

		export function javaHome(jdkDir:string): string {
			return jdkbundle.os.isMac() ? path.join(jdkDir, 'Home') : jdkDir;
		}

		export function isVSCodeStorage(targetPath:string, context:vscode.ExtensionContext): boolean {
			const _runtimePath = path.normalize(targetPath);
			const _userDir = path.normalize(context.globalStorageUri.fsPath);
			return _runtimePath.startsWith(_userDir);
		}

		export function isNewLeft(leftVersion:string, rightVersion:string): boolean {
			try {
				const optimize = (s:string) => s.replace(/_/g, '.');
				return compare(optimize(leftVersion), optimize(rightVersion), '>');
			} catch (e) {
				jdkbundle.log('Failed compare-versions: ' + e);
				return false;
			}
		}
	}

	export namespace os {

		export function isMac(): boolean {
			return process.platform === 'darwin';
		}

		export function isWindows(): boolean {
			return process.platform === 'win32';
		}
	
		export function isTarget(): boolean {
			return process.platform.match(/^(win32|darwin)$/) !== null || 
				(process.platform === 'linux' && process.arch === 'x64');
		}
	
		export function nameOf(javaVersion: number): string {
			if (!isTarget()) {
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

	export function rmSync(path:string, options?:object): void {
		try {
			if (fs.existsSync(path)) {
				fs.rmSync(path, options);
			}
		} catch (e) {
			jdkbundle.log('Failed rmSync: ' + e);
		}
	}
	
	export function log(message?: any, ...optionalParams: any[]): void {
		console.log(`[Pleiades]`, message, ...optionalParams);
	}
}
