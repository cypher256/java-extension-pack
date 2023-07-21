/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import { compare } from 'compare-versions';
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
	runtimes:userSettings.IJavaConfigRuntime[]) {

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

	// Detect User Installed JDK
	const detectedLatestMap = new Map<number, IDetectedJdk>();
	const availableVers = javaExtension.getAvailableVersions();
	for (const detectedJdk of await findAll()) {
		if (!availableVers.includes(detectedJdk.majorVersion)) {
			continue;
		}
		const latestJdk = detectedLatestMap.get(detectedJdk.majorVersion);
		if (!latestJdk || isNewLeft(detectedJdk.fullVersion, latestJdk.fullVersion)) {
			detectedLatestMap.set(detectedJdk.majorVersion, detectedJdk);
		}
	}

	// Detect Auto-Downloaded JDK (Previously downloaded versions)
	for (const majorVer of availableVers) {
		if (detectedLatestMap.has(majorVer)) {
			continue; // Prefer user-installed JDK
		}
		let verDir = path.join(autoContext.getGlobalStoragePath(), 'java', String(majorVer));
		if (await isValidHome(verDir)) {
			log.info(`Detected Auto-downloaded ${majorVer}`);
			detectedLatestMap.set(majorVer, {
				majorVersion: majorVer,
				fullVersion: '',
				homePath: verDir,
			});
		}
	}

	// Set Runtimes Configuration
	for (const detectedJdk of detectedLatestMap.values()) {
		const detectedName = javaExtension.nameOf(detectedJdk.majorVersion);
		const configRuntime = runtimes.find(r => r.name === detectedName);
		if (configRuntime) {
			if (autoContext.isUserInstalled(configRuntime.path)) {
				const configJdk = await findByPath(configRuntime.path); // Don't set if same fullVersion
				if (configJdk && isNewLeft(detectedJdk.fullVersion, configJdk.fullVersion)) {
					configRuntime.path = detectedJdk.homePath;
				}
				// else Keep if downloaded or same version
			}
		} else {
			runtimes.push({name: detectedName, path: detectedJdk.homePath});
		}
	}
}

function isNewLeft(leftFullVer:string, rightFullVer:string): boolean {
	try {
		const optimize = (s:string) => s.replace(/_/g, '.'); // e.g.) 1.8.0_362, 11.0.18
		return compare(optimize(leftFullVer), optimize(rightFullVer), '>');
	} catch (e) {
		log.warn('Failed compare-versions:', e);
		return false;
	}
}

/**
 * Returns true if valid JDK dir.
 * @param homeDir The home dir of the JDK.
 * @returns true if valid.
 */
export async function isValidHome(homeDir:string | undefined): Promise<boolean> {
	if (!homeDir) {return false;}
	const runtime = await jdkutils.getRuntime(homeDir, { checkJavac: true });
	return runtime?.hasJavac ? true : false;
}

/**
 * Returns the fixed dir of the JDK.
 * @param homeDir The home dir of the JDK.
 * @param defaultDir The default dir of the JDK.
 * @returns The fixed dir.
 */
export async function fixPath(homeDir:string, defaultDir?:string): Promise<string | undefined> {
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
	return defaultDir;
};

/**
 * Returns the IDetectedJdk object of the JDK.
 * @param homePath The home path of the JDK.
 * @returns The IDetectedJdk object.
 */
export async function findByPath(homePath: string): Promise<IDetectedJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

interface IDetectedJdk {
	readonly majorVersion: number;
	readonly fullVersion: string;
	readonly homePath: string;
}

function createJdk(runtime: jdkutils.IJavaRuntime | undefined): IDetectedJdk | undefined {
	if (runtime?.hasJavac && runtime.version) {
		return {
			majorVersion: runtime.version.major,
			fullVersion: runtime.version.java_version,
			homePath: runtime.homedir
		};
	}
	return undefined;
}

function pushJdk(managerName: string, jdk: IDetectedJdk | undefined, jdks: IDetectedJdk[]) {
	if (jdk) { // undefined if JRE
		jdks.push(jdk);
		log.info(`Detected ${managerName} ${jdk.majorVersion} (${jdk.fullVersion}) ${jdk.homePath}`);
	}
}

async function tryGlob(
	messagePrefix: string,
	jdks: IDetectedJdk[],
	distPattern: string | string[],
	globOptions?: GlobOptionsWithFileTypesUnset | undefined) {

	try {
		if (typeof distPattern === 'string') {
			distPattern = [distPattern];
		}
		const JAVA_EXE = '*/bin/java' + (OS.isWindows ? '.exe' : '');
		const distSlashGlobs = distPattern.map(p => path.join(p, JAVA_EXE).replace(/\\/g, '/'));
		for (const javaExeFile of await glob(distSlashGlobs, globOptions)) {
			const jdk = await findByPath(path.join(javaExeFile, '..', '..'));
			pushJdk(messagePrefix, jdk, jdks);
		}
	} catch (error) {
		log.info('glob error:', error); // Silent
	}
}

async function findAll(): Promise<IDetectedJdk[]> {
	const jdks: IDetectedJdk[] = [];
	const env = process.env;
	const scanStrategies = [
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
				await tryGlob('Windows', jdks, distPats);
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
			await tryGlob('Scoop', jdks, distPats, { ignore: '**/current/**' });
		},
		async () => {
			// IntelliJ (Windows, Linux)
			// e.g. C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
			if (OS.isMac) {return;} // Supported jdk-utils macOS.ts
			const distPat = path.join(os.homedir(), '.jdks');
			await tryGlob('IntelliJ', jdks, distPat);
		},
		async () => {
			// Pleiades
			if (OS.isWindows) {
				// e.g.    C:\pleiades\java\17\bin
				// C:\pleiades\2023-03\java\17\bin
				const distPats = ['c', 'd'].flatMap(drive => ['', '20*/'].map(p => `${drive}:/pleiades*/${p}java`));
				await tryGlob('Pleiades', jdks, distPats);
			} else if (OS.isMac) {
				// 2024+ aarch64 new path format (21/Home/bin -> 21/bin)
				// e.g. /Applications/Eclipse_2024-12.app/Contents/java/21/bin
				// Pending: Check access dialog on mac
				// await tryGlob('Pleiades', jdks, '/Applications/Eclipse_20*.app/Contents/java');
			}
		},
	];
	await Promise.allSettled(scanStrategies.map(f => f()));
	return jdks;
}
