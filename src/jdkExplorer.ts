/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import { compare } from 'compare-versions';
import * as jdkutils from 'jdk-utils';
import * as os from "os";
import * as path from 'path';
import * as jdk from './download/jdk';
import * as redhat from './redhat';
import * as settings from './settings';
import * as system from './system';
import { OS, log } from './system';

/**
 * Scan installed JDK on the system and updates the given Java runtimes.
 * @param javaConfig The Java configuration.
 * @param runtimes The Java runtimes.
 */
export async function scan(javaConfig: redhat.IJavaConfig, runtimes:redhat.JavaRuntimeArray) {

	// Fix JDK path
	let needImmediateUpdate = false;
	for (let i = runtimes.length - 1; i >= 0; i--) { // Decrement for splice (remove)
		const runtime = runtimes[i];
		// Unsupported name
		const availableNames = javaConfig.availableNames;
		if (availableNames.length > 0 && !availableNames.includes(runtime.name)) {
			log.info(`Remove unsupported name ${runtime.name}`);
			runtimes.splice(i, 1); // remove
			needImmediateUpdate = true;
			continue;
		}
		// Ignore manual setted path for force download (If invalid directory, temporary error)
		const originPath = runtime.path;
		const majorVer = redhat.versionOf(runtime.name);
		if (javaConfig.downloadLtsVers.includes(majorVer)) { // Download LTS only
			const downloadDir = jdk.getDownloadDir(majorVer);
			if (system.equalsPath(originPath, downloadDir)) {
				if (!(await isValidHome(downloadDir))) { // Not yet downloaded
					log.info(`Needs Reload: manual set runtime force download: ${originPath}`);
					javaConfig.needsReload = true;
				}
				continue;
			}
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
		settings.update(redhat.JavaRuntimeArray.CONFIG_KEY, runtimes);
	}

	// Detect JDK (PRECEDENCE: Installed (>Current) > Current Config > Installed (<=Current) > Auto-Downloaded)
	const detectedLatestMap = new Map<number, IDetectedJdk>(); // Key: Major Version

	// Detect Auto-Downloaded JDK (Support when user installation is uninstalled)
	for (const majorVer of javaConfig.availableVers) { // All versions for old version
		const downloadDir = jdk.getDownloadDir(majorVer);
		if (await isValidHome(downloadDir)) {
			log.info(`Detected Auto-downloaded ${majorVer}`);
			detectedLatestMap.set(majorVer, {
				majorVersion: majorVer,
				// Auto-detected download dir has lowest priority
				// Manually configured download dir has highest priority
				fullVersion: '0.0.0',
				homePath: downloadDir,
			});
		}
	}

	// Detect User Installed JDK
	for (const detectedJdk of await findAll()) {
		if (!javaConfig.availableVers.includes(detectedJdk.majorVersion)) {
			continue;
		}
		const latestJdk = detectedLatestMap.get(detectedJdk.majorVersion);
		if (!latestJdk || isNewLeft(detectedJdk.fullVersion, latestJdk.fullVersion)) {
			detectedLatestMap.set(detectedJdk.majorVersion, detectedJdk);
		}
	}

	// Check Runtimes Configuration
	for (const detectedJdk of detectedLatestMap.values()) {
		const detectedName = redhat.nameOf(detectedJdk.majorVersion);
		const configRuntime = runtimes.findByName(detectedName);
		if (configRuntime) {
			if (system.isUserInstalled(configRuntime.path)) {
				const configJdk = await findByPath(configRuntime.path);
				if (configJdk && isNewLeft(detectedJdk.fullVersion, configJdk.fullVersion)) {
					// Update new version (User installed)
					configRuntime.path = detectedJdk.homePath;
				}
				// else Keep (Detected is same or older)
			}
			// else Keep (Auto-Download dir)
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
	const utilRuntime = await jdkutils.getRuntime(homeDir, { checkJavac: true, withVersion: true });
	return createJdk(utilRuntime);
}

interface IDetectedJdk {
	readonly majorVersion: number;
	readonly fullVersion: string;
	readonly homePath: string;
}

function createJdk(utilRuntime: jdkutils.IJavaRuntime | undefined): IDetectedJdk | undefined {
	if (
		utilRuntime?.hasJavac &&
		utilRuntime.version &&
		utilRuntime.homedir !== '/usr' // Exclude alias /usr/bin/java (Linux, macOS)
	) {
		return {
			majorVersion: utilRuntime.version.major,
			fullVersion: utilRuntime.version.java_version,
			homePath: utilRuntime.homedir
		};
	}
	return undefined;
}

class DetectedJdkArray extends Array<IDetectedJdk> {

	pushJdk(logMessage: string, jdk: IDetectedJdk | undefined) {
		if (!jdk) {return;} // undefined if JRE
		this.push(jdk);
		log.info(`Detected ${logMessage} ${jdk.majorVersion} (${jdk.fullVersion}) ${jdk.homePath}`);
	}

	async pushByGlob(logMessage: string, ...globPatterns: string[]) {
		const javaExePats = globPatterns.map(p => path.join(p, '*', 'bin', jdkutils.JAVAC_FILENAME));
		const globOptions = { ignore: '**/current/bin/**' }; // scoop, homebrew, etc.
		for (const javaExeFile of await system.globSearch(javaExePats, globOptions)) {
			const jdk = await findByPath(path.join(javaExeFile, '..', '..'));
			this.pushJdk(logMessage, jdk);
		}
	}
}

async function findAll(): Promise<IDetectedJdk[]> {
	const jdks: DetectedJdkArray = new DetectedJdkArray();
	const env = process.env;
	const promises = [
		async () => {
			// jdk-utils: Gradle Toolchains support pull requested
			// Resolved) https://github.com/Eskibear/node-jdk-utils/issues/9
			const utilRuntimes = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
			utilRuntimes.map(createJdk).forEach(jdk => jdks.pushJdk('jdk-utils', jdk));
		},
		async () => {
			// Windows distributors not supported by jdk-utils
			// https://github.com/Eskibear/node-jdk-utils/blob/main/src/from/windows.ts
			if (!OS.isWindows) {return;}
			for (const programDir of [env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean) as string[]) {
				const dists = ['BellSoft', 'OpenJDK', 'RedHat', 'Semeru'];
				const patterns = dists.map(s => path.join(programDir, s));
				await jdks.pushByGlob('Windows', ...patterns);
			}
		},
		async () => {
			// Scoop (Windows)
			// e.g. C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
			if (!OS.isWindows) {return;}
			const userDir = env.SCOOP ?? path.join(os.homedir(), 'scoop');
			const globalDir = env.SCOOP_GLOBAL ?? path.join(env.ProgramData ?? '', 'scoop');
			const patterns = [userDir, globalDir].map(s => path.join(s, 'apps/*jdk*'));
			await jdks.pushByGlob('Scoop', ...patterns);
		},
		async () => {
			// vfox (Multi-Platform)
			// e.g. C:\Users\<UserName>\.version-fox\cache\java\v-22+36\java-22+36\bin
			await jdks.pushByGlob('vfox', os.homedir() + '/.version-fox/cache/java/*');
		},
		async () => {
			// Maven Toolchains
			// https://maven.apache.org/guides/mini/guide-using-toolchains.html
			const xml = system.readString(path.join(os.homedir(), '.m2', 'toolchains.xml')) || '';
			for (const match of xml.matchAll(/<jdkHome>([^<].+)<\/jdkHome>/g)) {
				const jdk = await findByPath(match[1].trim());
				jdks.pushJdk('Maven', jdk);
			}
		},
		async () => {
			// IntelliJ (Windows, Linux)
			// e.g. C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
			if (OS.isMac) {return;} // Supported jdk-utils macOS.ts: /Library/Java/JavaVirtualMachines
			const pattern = path.join(os.homedir(), '.jdks');
			await jdks.pushByGlob('IntelliJ', pattern);
		},
		async () => {
			// Pleiades (Windows, macOS)
			if (OS.isWindows) {
				// e.g.    C:\pleiades\java\17\bin
				// C:\pleiades\2023-03\java\17\bin
				const patterns = ['c', 'd'].flatMap(drive => ['', '20*/'].map(p => `${drive}:/pleiades*/${p}java`));
				await jdks.pushByGlob('Pleiades', ...patterns);
			} else if (OS.isMac) {
				// Pleiades 2024+ aarch64 new path format (21/Home/bin -> 21/bin)
				// e.g. /Applications/Eclipse_2024-12.app/Contents/java/21/bin
				await jdks.pushByGlob('Pleiades', '/Applications/Eclipse_20*.app/Contents/java');
			}
		},
		async () => {
			// Common (Windows)
			// e.g. C:\Java\jdk21.0.2\bin
			if (!OS.isWindows) {return;}
			const patterns = ['c', 'd'].map(drive => `${drive}:/java`);
			await jdks.pushByGlob('Common', ...patterns);
		},
	];
	await Promise.allSettled(promises.map(p => p()));
	return jdks;
}
