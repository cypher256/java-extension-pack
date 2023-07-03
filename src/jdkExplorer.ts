/**
 * VSCode Auto Config Java
 * Copyright (c) Shinji Kashihara.
 */
import { compare } from 'compare-versions';
import * as fs from 'fs';
import { GlobOptionsWithFileTypesUnset, glob } from 'glob';
import * as jdkutils from 'jdk-utils';
import * as os from "os";
import * as path from 'path';
import * as autoContext from './autoContext';
import { OS, log } from './autoContext';
import * as javaExtension from './javaExtension';
import * as userSettings from './userSettings';

/**
 * Scan installed JDK on the system and updates the given list of Java runtimes.
 * @param runtimes An array of Java configuration runtimes.
 */
export async function scan(
	runtimes:userSettings.IJavaRuntime[]) {

	// Fix JDK path
	const availableNames = javaExtension.getAvailableNames();
	let needImmediateUpdate = false;
	for (let i = runtimes.length - 1; i >= 0; i--) { // Decrement for splice
		const runtime = runtimes[i];
		if (availableNames.length > 0 && !availableNames.includes(runtime.name)) {
			log.info(`Remove unsupported name ${runtime.name}`);
			runtimes.splice(i, 1);
			needImmediateUpdate = true;
			continue;
		}
		const originPath = runtime.path;
		const fixedPath = await fixPath(originPath);
		if (!fixedPath) {
			log.info(`Remove invalid path ${originPath}`);
			runtimes.splice(i, 1);
			needImmediateUpdate = true;
			continue;
		}
		if (fixedPath !== originPath) {
			log.info(`Fix path\n   ${originPath}\n-> ${fixedPath}`);
			runtime.path = fixedPath;
			needImmediateUpdate = true;
		}
		// Don't check mismatches between manually set name and path
	}
	if (needImmediateUpdate) {
		// Immediate update for suppress invalid path error dialog (without await)
		userSettings.update(javaExtension.CONFIG_KEY_RUNTIMES, runtimes);
	}

	// Scan User Installed JDK
	const latestMajorMap = new Map<number, IInstalledJdk>();
	const availableVersions = javaExtension.getAvailableVersions();
	for (const jdk of await findInstalledJdks()) {
		if (!availableVersions.includes(jdk.majorVersion)) {
			continue;
		}
		const latestJdk = latestMajorMap.get(jdk.majorVersion);
		if (!latestJdk || isNewLeft(jdk.fullVersion, latestJdk.fullVersion)) {
			latestMajorMap.set(jdk.majorVersion, jdk);
		}
	}

	// TODO Remove (ADD 2023.5.2: Migrate old download location from '/' to '/java')
	const oldStorageDir = autoContext.getGlobalStoragePath();
	const newStorageDir = path.join(oldStorageDir, 'java');
	if (fs.existsSync(oldStorageDir)) {
		for (const name of await fs.promises.readdir(oldStorageDir)) {
			if (name.match(/\.(zip|gz)$/) || name.match(/^\d+$/)) {
				try {
					const oldPath = path.join(oldStorageDir, name);
					const newPath = path.join(newStorageDir, name);
					if (fs.existsSync(newPath)) {
						autoContext.rmSyncQuietly(oldPath);
					} else {
						autoContext.mkdirSyncQuietly(newStorageDir);
						fs.renameSync(oldPath, newPath);
					}
					const configRuntime = runtimes.find(r => r.path.toLowerCase() === oldPath.toLowerCase());
					if (configRuntime) {
						configRuntime.path = newPath;
					}
				} catch (error) {
					log.info('Failed move', error);
				}
			}
		}
	}

	// Scan Auto-Downloaded JDK (Previously downloaded versions)
	for (const major of availableVersions) {
		if (latestMajorMap.has(major)) {
			continue; // Prefer user-installed JDK
		}
		let versionDir = path.join(autoContext.getGlobalStoragePath(), 'java', String(major));
		if (await isValidPath(versionDir)) {
			log.info(`Detected ${major} Auto-downloaded JDK`);
			latestMajorMap.set(major, {
				majorVersion: major,
				fullVersion: '',
				homePath: versionDir,
			});
		}
	}

	// Set Runtimes Configuration
	for (const scannedJdk of latestMajorMap.values()) {
		const scannedName = javaExtension.nameOf(scannedJdk.majorVersion);
		const configRuntime = runtimes.find(r => r.name === scannedName);
		if (configRuntime) {
			if (autoContext.isUserInstalled(configRuntime.path)) {
				const configJdk = await findByPath(configRuntime.path); // Don't set if same fullVersion
				if (configJdk && isNewLeft(scannedJdk.fullVersion, configJdk.fullVersion)) {
					configRuntime.path = scannedJdk.homePath;
				}
				// else Keep if downloaded or same version
			}
		} else {
			runtimes.push({name: scannedName, path: scannedJdk.homePath});
		}
	}
}

function isNewLeft(leftVersion:string, rightVersion:string): boolean {
	try {
		const optimize = (s:string) => s.replace(/_/g, '.'); // e.g.) 1.8.0_362, 11.0.18
		return compare(optimize(leftVersion), optimize(rightVersion), '>');
	} catch (e) {
		log.warn('Failed compare-versions: ' + e);
		return false;
	}
}

/**
 * Returns true if valid JDK path.
 * @param homePath The path of the JDK.
 * @returns true if valid.
 */
export async function isValidPath(homePath:string | undefined): Promise<boolean> {
	if (!homePath) {return false;}
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true });
	return runtime?.hasJavac ? true : false;
}

/**
 * Returns the fixed path of the JDK.
 * @param homePath The path of the JDK.
 * @param defaultPath The default path of the JDK.
 * @returns The fixed path.
 */
export async function fixPath(homePath:string, defaultPath?:string): Promise<string | undefined> {
	const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
	let p = homePath;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (await isValidPath(p)) {return p;};
		p = path.join(p, '..');
	}
	if (OS.isMac) {
		const contentsHome = path.join(homePath, 'Contents', 'Home');
		if (await isValidPath(contentsHome)) {return contentsHome;}
		const home = path.join(homePath, 'Home');
		if (await isValidPath(home)) {return home;}
	}
	return defaultPath;
};

/**
 * Returns the IInstalledJdk object of the JDK.
 * @param homePath The path of the JDK.
 * @returns The IInstalledJdk object.
 */
export async function findByPath(homePath: string): Promise<IInstalledJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

interface IInstalledJdk {
	readonly majorVersion: number;
	readonly fullVersion: string;
	readonly homePath: string;
}

function createJdk(runtime: jdkutils.IJavaRuntime | undefined): IInstalledJdk | undefined {
	if (runtime?.hasJavac && runtime.version) {
		return {
			majorVersion: runtime.version.major,
			fullVersion: runtime.version.java_version,
			homePath: runtime.homedir
		};
	}
	return undefined;
}

async function tryGlob(
	logLabel: string,
	jdks: IInstalledJdk[],
	javaExePathPattern: string | string[],
	globOptions?: GlobOptionsWithFileTypesUnset | undefined) {

	try {
		if (typeof javaExePathPattern === 'string') {
			javaExePathPattern = [javaExePathPattern];
		}
		const globPatterns = javaExePathPattern.map(p => p.replace(/\\/g, '/'));
		for (const javaExeFile of await glob(globPatterns, globOptions)) {
			const jdk = await findByPath(path.join(javaExeFile, '..', '..'));
			pushJdk(logLabel, jdk, jdks);
		}
	} catch (error) {
		log.info('glob error', error); // Silent
	}
}

function pushJdk(managerName: string, jdk: IInstalledJdk | undefined, jdks: IInstalledJdk[]) {
	if (jdk) {
		jdks.push(jdk);
		log.info(`Detected ${managerName} ${jdk.majorVersion} (${jdk.fullVersion}) ${jdk.homePath}`);
	}
}

async function findInstalledJdks(): Promise<IInstalledJdk[]> {
	const jdks: IInstalledJdk[] = [];
	const scanStrategies = [
		async () => {
			// Find by jdk-utils, Gradle Toolchains support pull requested
			// https://github.com/Eskibear/node-jdk-utils/issues/9
			const runtimes = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
			runtimes.map(createJdk).forEach(jdk => pushJdk('jdk-utils', jdk, jdks));
		},
		async () => {
			// Find Scoop (Windows) e.g.
			// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			//      C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			if (!OS.isWindows) {return;}
			const SCOOP = process.env.SCOOP ?? path.join(os.homedir(), "scoop");
			const SCOOP_GLOBAL = process.env.SCOOP_GLOBAL ?? path.join(process.env.ProgramData ?? '', "scoop");
			const patterns = [SCOOP, SCOOP_GLOBAL].map(s => path.join(s, 'apps/*/*/bin/java.exe'));
			await tryGlob('Scoop', jdks, patterns, { ignore: '**/current/**' });
		},
		async () => {
			// Find IntelliJ (Windows, Linux) e.g.
			// C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
			if (OS.isMac) {return;} // Supported jdk-utils macOS.ts
			const pattern = path.join(os.homedir(), '.jdks/*/bin/java' + (OS.isWindows ? '.exe' : ''));
			await tryGlob('IntelliJ', jdks, pattern);
		},
		async () => {
			// Find Pleiades (Windows) e.g.
			// C:\pleiades\java\17\bin
			// C:\pleiades\2023-03\java\17\bin
			if (!OS.isWindows) {return;} // Windows only (Exclude macos JDK 32bit)
			const patterns = [...'cd']
				.flatMap(drive => ['', '20*/'].map(p => `${drive}:/pleiades*/${p}java/*/bin/java.exe`));
			await tryGlob('Pleiades', jdks, patterns);
		},
	];
	await Promise.allSettled(scanStrategies.map(f => f()));
	return jdks;
}
