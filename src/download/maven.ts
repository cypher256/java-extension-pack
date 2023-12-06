/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as httpClient from '../httpClient';
import * as system from '../system';
import { log } from '../system';
import * as userSettings from '../userSettings';
export const CONFIG_KEY_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * Downloads and installs the Maven if it is not already installed.
 * @return A promise that resolves when the Maven is installed.
 */
export async function download() {
	const latestDir = getLatestDir();
	const mavenExeOld = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	let mavenExeNew = await validate(latestDir, mavenExeOld);
	try {
		mavenExeNew = await httpget(latestDir, mavenExeNew);
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed download Maven.', e, e?.request?.path);
	}
	if (mavenExeOld !== mavenExeNew) {
		await userSettings.update(CONFIG_KEY_MAVEN_EXE_PATH, mavenExeNew);
	}
}

/**
 * Returns true if Maven is auto-updated with auto-downloaded path.
 * @returns true if the Maven path is auto-updated.
 */
export function isAutoUpdate(): boolean {
	const configMavenExe = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	if (!configMavenExe) {return false;}
	return system.equalsPath(getLatestDir(), path.join(configMavenExe, '..', '..'));
}

function getLatestDir(): string {
	return path.join(system.getGlobalStoragePath(), 'maven', 'latest');
}

async function validate(
	latestDir:string,
	configMavenExe:string | undefined): Promise<string | undefined> {

	if (configMavenExe) {
		const fixedPath = fixPath(configMavenExe);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_MAVEN_EXE_PATH, configMavenExe);
			configMavenExe = undefined; // Remove config entry
		} else {
			if (fixedPath !== configMavenExe) {
				log.info(`Fix ${CONFIG_KEY_MAVEN_EXE_PATH}\n   ${configMavenExe}\n-> ${fixedPath}`);
			}
			configMavenExe = fixedPath;
			if (system.isUserInstalled(configMavenExe)) {
				log.info('Available Maven (User installed)', CONFIG_KEY_MAVEN_EXE_PATH, configMavenExe);
				return configMavenExe;
			}
		}
	}
	if (!configMavenExe) {
		// Ignore system paths to always keep up to date
		/*
		const exeSystemPath = await system.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return configMavenExe; // Don't set config (Setting > mvnw > PATH)
		}
		*/
		if (existsExe(latestDir)) {
			configMavenExe = getExePath(latestDir);
		}
		// mvnw is used only if configMavenExe is empty
	}
	return configMavenExe;
}

async function httpget(
	latestDir:string,
	configMavenExe:string | undefined): Promise<string | undefined> {

    // Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = xml.match(/<version>\d+\.\d+\.\d+<\/version>/g).at(-1) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const versionFile = path.join(latestDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && existsExe(latestDir)) {
		const mdate = system.mdateSync(versionFile);
		log.info(`Available Maven ${version} (Updated ${mdate})`);
		return configMavenExe;
	}

    // Download
	await httpClient.execute({
		url: `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`,
		storeTempFile: latestDir + '_download_tmp.tar.gz',
		extractDestDir: latestDir,
		targetMessage: `Maven ${version}`,
	});
	if (!existsExe(latestDir)) {
		log.info('Invalid Maven:', latestDir);
		configMavenExe = undefined; // Remove config entry
		return configMavenExe; // Silent
	}
	fs.writeFileSync(versionFile, version); // Sync for catch

	// Set Settings
	configMavenExe = getExePath(latestDir);
	return configMavenExe;
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
