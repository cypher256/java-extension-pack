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

		export const CONFIG_KEY = 'java.configuration.runtimes';

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

		export function getRedhatNames(): string[] {
			const redhatJava = vscode.extensions.getExtension('redhat.java'); // extensionDependencies
			const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
			const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
			if (redhatRuntimeNames.length === 0) {
				jdkauto.log('Failed getExtension RedHat', redhatJava);
			}
			return redhatRuntimeNames;
		}

		export function getRedhatVersions(): number[] {
			return getRedhatNames().map(name => versionOf(name));
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

		export async function isValidJdk(javaHome:string | undefined): Promise<boolean> {
			if (!javaHome) {return false;}
			const runtime = await jdkutils.getRuntime(javaHome, { checkJavac: true });
			return runtime?.hasJavac ? true : false;
		}

		export async function fixPath(originPath:string, defaultPath?:string): Promise<string | undefined> {
			const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
			let p = originPath;
			for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
				if (await jdkauto.runtime.isValidJdk(p)) {return p;};
				p = path.resolve(p, '..');
			}
			if (jdkauto.os.isMac) {
				const contentsHome = path.join(originPath, 'Contents', 'Home');
				if (await jdkauto.runtime.isValidJdk(contentsHome)) {return contentsHome;}
				const home = path.join(originPath, 'Home');
				if (await jdkauto.runtime.isValidJdk(home)) {return home;}
			}
			return defaultPath;
		};
	}

	export namespace os {

		export const isWindows = process.platform === 'win32';
		export const isMac = process.platform === 'darwin';
		export const isLinux = process.platform === 'linux';
		export const isDownloadTarget = isWindows || isMac || (isLinux && process.arch === 'x64');
	
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
	
	export function rmSync(path:string): void {
		try {
			fs.rmSync(path, {recursive: true, force: true});
		} catch (e) {
			jdkauto.log('Failed rmSync: ' + e);
		}
	}
	
	export function log(message?: any, ...optionalParams: any[]): void {
		console.log(`[jdkauto]`, message, ...optionalParams);
	}
}
