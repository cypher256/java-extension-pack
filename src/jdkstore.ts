/**
 * Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as os from "os";
import * as path from 'path';
import { glob } from 'glob-latest';
import * as jdkutils from 'jdk-utils';
import * as jdkauto from './jdkauto';

export async function isValidJdk(homePath:string | undefined): Promise<boolean> {
	if (!homePath) {return false;}
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true });
	return runtime?.hasJavac ? true : false;
}

export async function fixPath(homePath:string, defaultPath?:string): Promise<string | undefined> {
	const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
	let p = homePath;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (await isValidJdk(p)) {return p;};
		p = path.join(p, '..');
	}
	if (jdkauto.isMac) {
		const contentsHome = path.join(homePath, 'Contents', 'Home');
		if (await isValidJdk(contentsHome)) {return contentsHome;}
		const home = path.join(homePath, 'Home');
		if (await isValidJdk(home)) {return home;}
	}
	return defaultPath;
};

export interface IJdk {
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

export async function getJdk(homePath: string): Promise<IJdk | undefined> {
	const runtime = await jdkutils.getRuntime(homePath, { checkJavac: true, withVersion: true });
	return createJdk(runtime);
}

export async function findJdks(): Promise<IJdk[]> {
	const runtimes: IJdk[] = [];
	await Promise.all([
		findByJdkUtils(runtimes),
		findScoop(runtimes),
		findIntelliJ(runtimes)
	]);
	return runtimes;
}

async function findByJdkUtils(jdks: IJdk[]) {
	const runtimes = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
	runtimes.map(createJdk).filter(jdk => jdk).forEach(jdk => jdks.push(jdk!));
}

// Find Scoop e.g.
// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
//      C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
async function findScoop(runtimes: IJdk[]) {
	if (!jdkauto.isWindows) {return;}
	const SCOOP = process.env.SCOOP ?? path.join(os.homedir(), "scoop");
	const SCOOP_GLOBAL = process.env.SCOOP_GLOBAL ?? path.join(process.env.ProgramData ?? '', "scoop");
	const patterns = [SCOOP, SCOOP_GLOBAL].map(s => toGlobPath(path.join(s, 'apps/*/*/bin/java.exe')));
	await pushJdk(runtimes, await glob(patterns, { ignore: '**/current/**' }));
}

// Find IntelliJ e.g.
// C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
async function findIntelliJ(jdks: IJdk[]) {
	if (jdkauto.isMac) {return;} // Supported jdk-utils macOS.ts
	const pattern = path.join(os.homedir(), '.jdks/*/bin/java' + (jdkauto.isWindows ? '.exe' : ''));
	await pushJdk(jdks, await glob(toGlobPath(pattern)));
}

function toGlobPath(p: string): string {
	return p.replace(/\\/g, '/');
}

async function pushJdk(jdks: IJdk[], javaExes: string[]) {
	for (const javaExe of javaExes) {
		const runtime = await getJdk(path.join(javaExe, '..', '..'));
		if (runtime) {
			jdks.push(runtime);
		}
	}
}
