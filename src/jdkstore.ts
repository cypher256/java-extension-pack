/**
 * Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as os from "os";
import * as path from 'path';
import { glob } from 'glob-latest';
import * as jdkutils from 'jdk-utils';
import * as jdkauto from './jdkauto';

export async function isValidJdk(javaHome:string | undefined): Promise<boolean> {
	if (!javaHome) {return false;}
	const runtime = await jdkutils.getRuntime(javaHome, { checkJavac: true });
	return runtime?.hasJavac ? true : false;
}

export async function fixPath(originPath:string, defaultPath?:string): Promise<string | undefined> {
	const MAX_UPPER_LEVEL = 2; // e.g. /jdk/bin/java -> /jdk
	let p = originPath;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (await isValidJdk(p)) {return p;};
		p = path.join(p, '..');
	}
	if (jdkauto.isMac) {
		const contentsHome = path.join(originPath, 'Contents', 'Home');
		if (await isValidJdk(contentsHome)) {return contentsHome;}
		const home = path.join(originPath, 'Home');
		if (await isValidJdk(home)) {return home;}
	}
	return defaultPath;
};

export async function getRuntime(homedir: string): Promise<jdkutils.IJavaRuntime | undefined> {
	return await jdkutils.getRuntime(homedir, { checkJavac: true, withVersion: true });
}

export async function findRuntimes(): Promise<jdkutils.IJavaRuntime[]> {
	const runtimes: jdkutils.IJavaRuntime[] = [];
	await Promise.all([
		findByJdkUtils(runtimes),
		findScoop(runtimes),
		findIntelliJ(runtimes)
	]);
	return runtimes;
}

async function findByJdkUtils(runtimes: jdkutils.IJavaRuntime[]) {
	const rts = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
	runtimes.push(...rts);
}

// Find Scoop e.g.
// C:\Users\<UserName>\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
//      C:\ProgramData\scoop\apps\sapmachine18-jdk\18.0.2.1\bin
async function findScoop(runtimes: jdkutils.IJavaRuntime[]) {
	if (jdkauto.isWindows) {
		const SCOOP = process.env.SCOOP ?? path.join(os.homedir(), "scoop");
		const SCOOP_GLOBAL = process.env.SCOOP_GLOBAL ?? path.join(process.env.ProgramData ?? '', "scoop");
		const patterns = [SCOOP, SCOOP_GLOBAL].map(s => toGlobPath(path.join(s, 'apps/*/*/bin/java.exe')));
		await pushRuntime(runtimes, await glob(patterns, { ignore: '**/current/**' }));
	}
}

// Find IntelliJ e.g.
// C:\Users\<UserName>\.jdks\openjdk-20.0.1\bin
// ~/Library/Java/JavaVirtualMachines/openjdk-20.0.1/Contents/Home/bin
async function findIntelliJ(runtimes: jdkutils.IJavaRuntime[]) {
	const pattern = path.join(os.homedir(), 
		jdkauto.isMac ? 'Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java' : 
		jdkauto.isWindows ? '.jdks/*/bin/java.exe' : '.jdks/*/bin/java')
	;
	await pushRuntime(runtimes, await glob(toGlobPath(pattern)));
}

function toGlobPath(p: string): string {
	return p.replace(/\\/g, '/');
}

async function pushRuntime(runtimes: jdkutils.IJavaRuntime[], javaExes: string[]) {
	for (const javaExe of javaExes) {
		const runtime = await getRuntime(path.join(javaExe, '..', '..'));
		if (runtime) {
			runtimes.push(runtime);
		}
	}
}
