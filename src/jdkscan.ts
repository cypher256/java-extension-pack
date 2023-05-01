/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as os from "os";
import * as path from 'path';
import { GlobOptionsWithFileTypesUnset, glob } from 'glob-latest';
import * as jdkutils from 'jdk-utils';
import * as jdkconfig from './jdkconfig';
import * as jdkcontext from './jdkcontext';
const { log, OS } = jdkcontext;

/**
 * Scan installed JDK on the system and updates the given list of Java runtimes.
 * @param runtimes An array of installed Java runtimes.
 */
export async function scan(
	runtimes:jdkconfig.IConfigRuntime[]) {

	// Fix JDK path
	const redhatNames = jdkconfig.runtime.getRedhatNames();
	for (let i = runtimes.length - 1; i >= 0; i--) { // Decrement for splice
		const runtime = runtimes[i];
		if (redhatNames.length > 0 && !redhatNames.includes(runtime.name)) {
			log.info(`Remove unsupported name ${runtime.name}`);
			runtimes.splice(i, 1);
			continue;
		}
		const originPath = runtime.path;
		const fixedPath = await fixPath(originPath);
		if (!fixedPath) {
			log.info(`Remove invalid path ${originPath}`);
			runtimes.splice(i, 1);
		} else if (fixedPath !== originPath) {
			log.info(`Fix\n   ${originPath}\n-> ${fixedPath}`);
			runtimes[i].path = fixedPath;
		}
	}

	// Scan User Installed JDK
	const latestMajorMap = new Map<number, IJdk>();
	const redhatVersions = jdkconfig.runtime.getRedhatVersions();

	for (const jdk of await findAll()) {
		if (!redhatVersions.includes(jdk.majorVersion)) {
			continue;
		}
		const latestJdk = latestMajorMap.get(jdk.majorVersion);
		if (!latestJdk || jdkconfig.runtime.isNewLeft(jdk.fullVersion, latestJdk.fullVersion)) {
			latestMajorMap.set(jdk.majorVersion, jdk);
		}
	}

	// Scan Auto-Downloaded JDK (Old Java Version Support)
	for (const major of redhatVersions) {
		if (latestMajorMap.has(major)) {
			continue; // Prefer user-installed JDK
		}
		let downloadJdkDir = path.join(jdkcontext.getGlobalStoragePath(), String(major));
		if (await isValidPath(downloadJdkDir)) {
			log.info(`Detected ${major} Auto-downloaded JDK`);
			latestMajorMap.set(major, {
				majorVersion: major,
				fullVersion: '',
				homePath: downloadJdkDir,
			});
		}
	}

	// Set Runtimes Configuration
	for (const scannedJdk of latestMajorMap.values()) {
		const scannedName = jdkconfig.runtime.nameOf(scannedJdk.majorVersion);
		const configRuntime = runtimes.find(r => r.name === scannedName);
		if (configRuntime) {
			if (jdkconfig.runtime.isUserInstalled(configRuntime.path)) {
				const configJdk = await findByPath(configRuntime.path); // Don't set if same fullVersion
				if (configJdk && jdkconfig.runtime.isNewLeft(scannedJdk.fullVersion, configJdk.fullVersion)) {
					configRuntime.path = scannedJdk.homePath;
				}
				// else Keep if downloaded or same version
			}
		} else {
			runtimes.push({name: scannedName, path: scannedJdk.homePath});
		}
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
 * Returns the IJdk object of the JDK.
 * @param homePath The path of the JDK.
 * @returns The IJdk object.
 */
export async function findByPath(homePath: string): Promise<IJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

interface IJdk {
	majorVersion: number;
	fullVersion: string;
	homePath: string;
}

function createJdk(runtime: jdkutils.IJavaRuntime | undefined): IJdk | undefined {
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
	managerName: string,
	jdks: IJdk[], 
	pattern: string | string[], 
	options?: GlobOptionsWithFileTypesUnset | undefined) {

	try {
		if (typeof pattern === 'string') {
			pattern = [pattern];
		}
		pattern = pattern.map(p => p.replace(/\\/g, '/'));
		for (const javaExe of await glob(pattern, options)) {
			const jdk = await findByPath(path.join(javaExe, '..', '..'));
			pushJdk(managerName, jdk, jdks);
		}
	} catch (error) {
		log.info('glob error', error); // Silent
	}
}

function pushJdk(managerName: string, jdk: IJdk | undefined, jdks: IJdk[]) {
	if (jdk) {
		jdks.push(jdk);
		log.info(`Detected ${managerName} ${jdk.majorVersion} (${jdk.fullVersion}) ${jdk.homePath}`);
	}
}

async function findAll(): Promise<IJdk[]> {
	const jdks: IJdk[] = [];
	const scanAsyncs = [
		async () => {
			// Find by jdk-utils
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
			// C:\pleiades\2023-03\java\17\bin
			if (!OS.isWindows) {return;} // Windows only (Exclude macos JDK 32bit)
			const patterns = [...'cd'].map(c => `${c}:/pleiades/20*/java/*/bin/java.exe`);
			await tryGlob('Pleiades', jdks, patterns);
		},
	];
	await Promise.all(scanAsyncs.map(f => f()));
	return jdks;
}
