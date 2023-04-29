/**
 * Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as os from "os";
import * as path from 'path';
import { GlobOptionsWithFileTypesUnset, glob } from 'glob-latest';
import * as jdkutils from 'jdk-utils';
import * as jdkauto from './jdkauto';
const log = jdkauto.log;

export async function isValidPath(homePath:string | undefined): Promise<boolean> {
	if (!homePath) {return false;}
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true });
	return runtime?.hasJavac ? true : false;
}

export async function fixPath(homePath:string, defaultPath?:string): Promise<string | undefined> {
	const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
	let p = homePath;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (await isValidPath(p)) {return p;};
		p = path.join(p, '..');
	}
	if (jdkauto.isMac) {
		const contentsHome = path.join(homePath, 'Contents', 'Home');
		if (await isValidPath(contentsHome)) {return contentsHome;}
		const home = path.join(homePath, 'Home');
		if (await isValidPath(home)) {return home;}
	}
	return defaultPath;
};

export interface IJdk {
	majorVersion: number;
	fullVersion: string;
	homePath: string;
}

export async function findByPath(homePath: string): Promise<IJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

export async function findAll(): Promise<IJdk[]> {
	const runtimes: IJdk[] = [];
	await Promise.all([
		findByJdkUtils(runtimes),
		findScoop(runtimes),
		findIntelliJ(runtimes),
		findPleiades(runtimes),
	]);
	return runtimes;
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

async function tryGlob(jdks: IJdk[], pattern: string | string[], options?: GlobOptionsWithFileTypesUnset | undefined) {
	try {
		if (typeof pattern === 'string') {
			pattern = [pattern];
		}
		pattern = pattern.filter(p => p.replace(/\\/g, '/'));
		const javaExes = await glob(pattern, options);
		for (const javaExe of javaExes) {
			const runtime = await findByPath(path.join(javaExe, '..', '..'));
			if (runtime) {
				jdks.push(runtime);
			}
		}
	} catch (error) {
		log.info('glob error', error);
	}
}

async function findByJdkUtils(jdks: IJdk[]) {
	const runtimes = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
	runtimes.map(createJdk).filter(jdk => jdk).forEach(jdk => jdks.push(jdk!));
}

// Find Scoop (Windows) e.g.
// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
//      C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
async function findScoop(jdks: IJdk[]) {
	if (!jdkauto.isWindows) {return;}
	const SCOOP = process.env.SCOOP ?? path.join(os.homedir(), "scoop");
	const SCOOP_GLOBAL = process.env.SCOOP_GLOBAL ?? path.join(process.env.ProgramData ?? '', "scoop");
	const patterns = [SCOOP, SCOOP_GLOBAL].map(s => path.join(s, 'apps/*/*/bin/java.exe'));
	await tryGlob(jdks, patterns, { ignore: '**/current/**' });
}

// Find IntelliJ (Windows, Linux) e.g.
// C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
async function findIntelliJ(jdks: IJdk[]) {
	if (jdkauto.isMac) {return;} // Supported jdk-utils macOS.ts
	const pattern = path.join(os.homedir(), '.jdks/*/bin/java' + (jdkauto.isWindows ? '.exe' : ''));
	await tryGlob(jdks, pattern);
}

// Find Pleiades (Windows) e.g.
// C:\pleiades\2023-03\java\17\bin
async function findPleiades(jdks: IJdk[]) {
	if (!jdkauto.isWindows) {return;} // Windows only (macos JDK 32bit)
	const patterns = [...'cd'].map(c => `${c}:/pleiades/20*/java/*/bin/java.exe`);
	await tryGlob(jdks, patterns);
}
