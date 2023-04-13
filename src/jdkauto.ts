/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jdkutils from 'jdk-utils';
import { compare } from 'compare-versions';

export namespace jdkauto {

	export interface ConfigRuntime {
		name: string;
		path: string;
		default?: boolean;
	}

	export namespace runtime {

		export function versionOf(runtimeName:string): number {
			return Number(runtimeName.replace(/^J(ava|2)SE-(1\.|)/, ''));
		}

		export function nameOf(majorVersion:number): string {
			if (majorVersion <= 5) {
				return 'J2SE-1.' + majorVersion;
			} else if (majorVersion <= 8) {
				return 'JavaSE-1.' + majorVersion;
			}
			return 'JavaSE-' + majorVersion;
		}

		export function javaHome(downloadJdkDir:string): string {
			return jdkauto.os.isMac() ? path.join(downloadJdkDir, 'Home') : downloadJdkDir;
		}

		export function isUserInstalled(javaHome:string, context:vscode.ExtensionContext): boolean {
			const _javaHome = path.normalize(javaHome);
			const _globalStorageDir = path.normalize(context.globalStorageUri.fsPath);
			return !_javaHome.startsWith(_globalStorageDir);
		}

		export function isNewLeft(leftVersion:string, rightVersion:string): boolean {
			try {
				const optimize = (s:string) => s.replace(/_/g, '.');
				return compare(optimize(leftVersion), optimize(rightVersion), '>');
			} catch (e) {
				jdkauto.log('Failed compare-versions: ' + e);
				return false;
			}
		}

		export async function isValidJdk(javaHome:string): Promise<boolean> {
			const runtime = await jdkutils.getRuntime(javaHome, { checkJavac: true });
			return runtime?.hasJavac ? true : false;
		}
	}

	export namespace os {

		export function isMac(): boolean {
			return process.platform === 'darwin';
		}

		export function isWindows(): boolean {
			return process.platform === 'win32';
		}
	
		export function isDownloadTarget(): boolean {
			return process.platform.match(/^(win32|darwin)$/) !== null || 
				(process.platform === 'linux' && process.arch === 'x64');
		}
	
		export function nameOf(javaVersion: number): string {
			if (!isDownloadTarget()) {
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
			jdkauto.log('Failed rmSync: ' + e);
		}
	}
	
	export function log(message?: any, ...optionalParams: any[]): void {
		console.log(`[Pleiades]`, message, ...optionalParams);
	}
}
