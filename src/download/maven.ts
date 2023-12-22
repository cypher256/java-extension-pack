/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as httpClient from '../httpClient';
import * as system from '../system';
import { log } from '../system';
import * as userSettings from '../userSettings';
const CONFIG_KEY_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * @param useWhich true to search from system path.
 * @returns The path of the Maven bin directory.
 */
export async function getBinDir(useWhich:boolean): Promise<string | undefined> {
	let binDir:string | undefined = undefined;
	let mvnExePath = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	if (!mvnExePath && useWhich) {
		mvnExePath = await system.whichPath('mvn');
	}
	if (mvnExePath) {
		binDir = path.join(mvnExePath, '..');
	}
	return binDir;
}

/**
 * @returns true if Maven is auto-updated with auto-downloaded path.
 */
export function isAutoUpdate(): boolean {
	const configMavenExe = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	if (!configMavenExe) {return false;}
	return system.equalsPath(getDownloadDir(), path.join(configMavenExe, '..', '..'));
}

/**
 * Downloads and installs the Maven if it is not already installed.
 * @returns A promise that resolves when the Maven is installed.
 */
export async function download() {
	const mavenExeOld = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	let mavenExeNew = await resolve(mavenExeOld);
	if (mavenExeNew && system.isUserInstalled(mavenExeNew)) {
		log.info('Available Maven (User installed)', CONFIG_KEY_MAVEN_EXE_PATH, mavenExeNew);
	} else {
		try {
			mavenExeNew = await httpget();
		} catch (e:any) {
			// Silent: offline, 404, 503 proxy auth error, or etc.
			log.info('Failed download Maven.', e, e?.request?.path);
		}
	}
	if (mavenExeOld !== mavenExeNew) {
		await userSettings.update(CONFIG_KEY_MAVEN_EXE_PATH, mavenExeNew);
	}
	// Note: mvnw is used only if undefined
}

function getDownloadDir(): string {
	return path.join(system.getGlobalStoragePath(), 'maven', 'latest');
}

async function resolve(
	configMavenExe:string | undefined): Promise<string | undefined> {

	if (configMavenExe) {
		const fixedPath = fixPath(configMavenExe);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_MAVEN_EXE_PATH, configMavenExe);
			configMavenExe = undefined; // Fallback to auto-download
		} else {
			if (fixedPath !== configMavenExe) {
				log.info(`Fix ${CONFIG_KEY_MAVEN_EXE_PATH}\n   ${configMavenExe}\n-> ${fixedPath}`);
			}
			configMavenExe = fixedPath;
		}
	}
	if (!configMavenExe) {
		/*
		const exeSystemPath = await system.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return undefined; // Don't set config (Setting > mvnw > PATH)
		}
		*/
		// If undefined, restore from downloaded (Fallback for http connect failures)
		const downloadDir = getDownloadDir();
		if (existsExe(downloadDir)) {
			configMavenExe = getExePath(downloadDir);
			return configMavenExe;
		}
	}
	return configMavenExe; // undefined at first download
}

async function httpget(): Promise<string | undefined> {

	// Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = xml.match(/<version>\d+\.\d+\.\d+<\/version>/g).at(-1) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const downloadDir = getDownloadDir();
	const versionFile = path.join(downloadDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && existsExe(downloadDir)) {
		const mdate = system.mdateSync(versionFile);
		log.info(`Available Maven ${version} (Updated ${mdate})`);
		return getExePath(downloadDir);
	}

    // Download
	await httpClient.execute({
		url: `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`,
		storeTempFile: downloadDir + '_download_tmp.tar.gz',
		extractDestDir: downloadDir,
		targetMessage: `Maven ${version}`,
	});
	if (!existsExe(downloadDir)) {
		log.info('Invalid Maven:', downloadDir);
		return undefined; // Silent: Remove config entry
	}
	fs.writeFileSync(versionFile, version); // Sync for catch
	return getExePath(downloadDir);
}

function existsExe(homeDir:string) {
    return system.existsFile(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'mvn');
}

function fixPath(exePath:string): string | undefined {
	for (const fixedPath of [
		exePath,
		path.join(exePath, 'mvn'),
		path.join(exePath, 'bin', 'mvn'),
	]) {
		if (system.existsFile(fixedPath)) {
			return fixedPath;
		}
	}
	return undefined;
}
