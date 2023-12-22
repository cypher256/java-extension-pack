/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import { compare } from 'compare-versions';
import { GlobOptionsWithFileTypesUnset } from 'glob';
import * as jdkutils from 'jdk-utils';
import * as os from "os";
import * as path from 'path';
import * as jdk from './download/jdk';
import * as jdtExtension from './jdtExtension';
import * as system from './system';
import { OS, log } from './system';
import * as userSettings from './userSettings';

/**
 * Scan installed JDK on the system and updates the given array of Java runtimes.
 * @param runtimes An array of Java configuration runtimes.
 */
export async function scan(runtimes:jdtExtension.JavaConfigRuntimeArray) {

	// Fix JDK path
	const availableNames = jdtExtension.getAvailableNames();
	let needImmediateUpdate = false;
	for (let i = runtimes.length - 1; i >= 0; i--) { // Decrement for splice (remove)
		const runtime = runtimes[i];
		// Unsupported name
		if (availableNames.length > 0 && !availableNames.includes(runtime.name)) {
			log.info(`Remove unsupported name ${runtime.name}`);
			runtimes.splice(i, 1); // remove
			needImmediateUpdate = true;
			continue;
		}
		// Ignore manual setted path for force download (If invalid directory, temporary error)
		const originPath = runtime.path;
		const downloadDir = jdk.getDownloadDir(jdtExtension.versionOf(runtime.name));
		if (system.equalsPath(originPath, downloadDir)) {
			continue;
		}
		// Invalid path
		const fixedPath = await fixPath(originPath);
		if (!fixedPath) {
			log.info(`Remove invalid path ${originPath}`);
			runtimes.splice(i, 1); // remove
			needImmediateUpdate = true;
			continue;
		}
		// Update path
		if (fixedPath !== originPath) {
			log.info(`Fix path\n   ${originPath}\n-> ${fixedPath}`);
			runtime.path = fixedPath;
			needImmediateUpdate = true;
		}
		// Don't check mismatches between manually set name and path
	}
	if (needImmediateUpdate) {
		// Immediate update for suppress invalid path error dialog (without await)
		userSettings.update(jdtExtension.JavaConfigRuntimeArray.CONFIG_KEY, runtimes);
	}

	// Detect User Installed JDK
	const detectedLatestMap = new Map<number, IDetectedJdk>();
	const availableVers = jdtExtension.getAvailableVersions();
	for (const detectedJdk of await findAll()) {
		if (!availableVers.includes(detectedJdk.majorVersion)) {
			continue;
		}
		const latestJdk = detectedLatestMap.get(detectedJdk.majorVersion);
		if (!latestJdk || isNewLeft(detectedJdk.fullVersion, latestJdk.fullVersion)) {
			detectedLatestMap.set(detectedJdk.majorVersion, detectedJdk);
		}
	}

	// Detect Auto-Downloaded JDK (Support when user installation is uninstalled)
	for (const majorVer of availableVers) {
		if (detectedLatestMap.has(majorVer)) { // TODO: findByVersion
			continue; // Prefer detected JDK
		}
		let downloadDir = jdk.getDownloadDir(majorVer);
		if (await isValidHome(downloadDir)) {
			log.info(`Detected Auto-downloaded ${majorVer}`);
			detectedLatestMap.set(majorVer, {
				majorVersion: majorVer,
				fullVersion: '',
				homePath: downloadDir,
			});
		}
	}

	// Set Runtimes Configuration
	for (const detectedJdk of detectedLatestMap.values()) {
		const detectedName = jdtExtension.nameOf(detectedJdk.majorVersion);
		const configRuntime = runtimes.findByName(detectedName);
		if (configRuntime) {
			if (system.isUserInstalled(configRuntime.path)) {
				const configJdk = await findByPath(configRuntime.path);
				if (configJdk && isNewLeft(detectedJdk.fullVersion, configJdk.fullVersion)) {
					// Update to new version
					configRuntime.path = detectedJdk.homePath;
				}
				// else Keep (Detected is same or older)
			}
			// else Keep (Auto-Downloaded)
		} else {
			// Add new entry
			runtimes.push({name: detectedName, path: detectedJdk.homePath});
		}
	}
}

function isNewLeft(leftFullVer:string, rightFullVer:string): boolean {
	try {
		const optimize = (s:string) => s.replace(/_/g, '.'); // e.g.) 1.8.0_362 => 1.8.0.362
		return compare(optimize(leftFullVer), optimize(rightFullVer), '>');
		// 21.0.0 > 21 = false
		// 21.0.1 > 21 = true
	} catch (e) {
		log.warn(`Failed compare [${leftFullVer}] [${rightFullVer}]`, e);
		return false;
	}
}

/**
 * @param homeDir The home dir of the JDK.
 * @returns true if valid JDK dir.
 */
export async function isValidHome(homeDir:string | undefined): Promise<boolean> {
	if (!homeDir) {return false;}
	const runtime = await jdkutils.getRuntime(homeDir, { checkJavac: true });
	return !!(runtime?.hasJavac);
}

/**
 * @param homeDir The home dir of the JDK.
 * @returns The fixed dir of the JDK. undefined if cannot fix.
 */
export async function fixPath(homeDir:string | undefined): Promise<string | undefined> {
	if (!homeDir) {return undefined;}
	const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
	let d = homeDir;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (await isValidHome(d)) {return d;};
		d = path.join(d, '..');
	}
	if (OS.isMac) {
		const contentsHome = path.join(homeDir, 'Contents', 'Home');
		if (await isValidHome(contentsHome)) {return contentsHome;}
		const home = path.join(homeDir, 'Home');
		if (await isValidHome(home)) {return home;}
	}
	return undefined;
};

/**
 * @param homeDir The home dir of the JDK.
 * @returns The IDetectedJdk object of the JDK. undefined if not found.
 */
export async function findByPath(homeDir: string): Promise<IDetectedJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homeDir, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

interface IDetectedJdk {
	readonly majorVersion: number;
	readonly fullVersion: string;
	readonly homePath: string;
}

function createJdk(runtime: jdkutils.IJavaRuntime | undefined): IDetectedJdk | undefined {
	if (
		runtime?.hasJavac &&
		runtime.version &&
		runtime.homedir !== '/usr' // Exclude alias /usr/bin/java (Linux, macOS)
	) {
		return {
			majorVersion: runtime.version.major,
			fullVersion: runtime.version.java_version,
			homePath: runtime.homedir
		};
	}
	return undefined;
}

function pushJdk(logMessage: string, jdk: IDetectedJdk | undefined, jdks: IDetectedJdk[]) {
	if (jdk) { // undefined if JRE
		jdks.push(jdk);
		log.info(`Detected ${logMessage} ${jdk.majorVersion} (${jdk.fullVersion}) ${jdk.homePath}`);
	}
}

async function findBy(
	logMessage: string,
	jdks: IDetectedJdk[],
	distPattern: string | string[],
	globOptions?: GlobOptionsWithFileTypesUnset | undefined) {

	const pats = Array.isArray(distPattern) ? distPattern : [distPattern];
	const javaExePats = pats.map(p => path.join(p, '*', 'bin', jdkutils.JAVAC_FILENAME));
	for (const javaExeFile of await system.globSearch(javaExePats, globOptions)) {
		const jdk = await findByPath(path.join(javaExeFile, '..', '..'));
		pushJdk(logMessage, jdk, jdks);
	}
}

async function findAll(): Promise<IDetectedJdk[]> {
	const jdks: IDetectedJdk[] = [];
	const env = process.env;
	const promises = [
		async () => {
			// jdk-utils: Gradle Toolchains support pull requested
			// https://github.com/Eskibear/node-jdk-utils/issues/9
			const runtimes = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
			runtimes.map(createJdk).forEach(jdk => pushJdk('jdk-utils', jdk, jdks));
		},
		async () => {
			// jdk-utils not supported Windows Distributors
			// https://github.com/Eskibear/node-jdk-utils/blob/main/src/from/windows.ts
			if (!OS.isWindows) {return;}
			for (const programDir of [env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean) as string[]) {
				const dists = ['BellSoft', 'OpenJDK', 'RedHat', 'Semeru'];
				const distPats = dists.map(s => path.join(programDir, s));
				await findBy('Windows', jdks, distPats);
			}
		},
		async () => {
			// Scoop (Windows)
			// e.g. C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			if (!OS.isWindows) {return;}
			const userDir = env.SCOOP ?? path.join(os.homedir(), 'scoop');
			const globalDir = env.SCOOP_GLOBAL ?? path.join(env.ProgramData ?? '', 'scoop');
			const distPats = [userDir, globalDir].map(s => path.join(s, 'apps/*jdk*'));
			await findBy('Scoop', jdks, distPats, { ignore: '**/current/**' });
		},
		async () => {
			// IntelliJ (Windows, Linux)
			// e.g. C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
			if (OS.isMac) {return;} // Supported jdk-utils macOS.ts
			const distPat = path.join(os.homedir(), '.jdks');
			await findBy('IntelliJ', jdks, distPat);
		},
		async () => {
			// Pleiades
			if (OS.isWindows) {
				// e.g.    C:\pleiades\java\17\bin
				// C:\pleiades\2023-03\java\17\bin
				const distPats = ['c', 'd'].flatMap(drive => ['', '20*/'].map(p => `${drive}:/pleiades*/${p}java`));
				await findBy('Pleiades', jdks, distPats);
			} else if (OS.isMac) {
				// 2024+ aarch64 new path format (21/Home/bin -> 21/bin)
				// e.g. /Applications/Eclipse_2024-12.app/Contents/java/21/bin
				// Pending: Check access dialog on mac
				// await tryGlob('Pleiades', jdks, '/Applications/Eclipse_20*.app/Contents/java');
			}
		},
	];
	await Promise.allSettled(promises.map(p => p()));
	return jdks;
}
