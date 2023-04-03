/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as fs from 'fs';

export namespace Pleiades {

	export interface JavaRuntime {
		name: string;
		path: string;
		default?: Boolean;
	}
	
	export class OsArch {
	
		public isTarget(): Boolean {
			return process.platform.match(/^(win32|darwin)$/) !== null || 
				(process.platform === 'linux' && process.arch === 'x64');
		}
	
		public getString(javaVersion: number): string {
			if (!this.isTarget()) {
				throw `Unsupported OS architecture. ${process.platform} ${process.arch}`;
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
			Pleiades.log('Failed remove: ' + e);
		}
	}
	
	export function log(message?: any, ...optionalParams: any[]): void {
		console.log(`[Pleiades]`, message, ...optionalParams);
	}
}
