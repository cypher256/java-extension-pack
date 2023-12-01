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
	const homeDir = path.join(system.getGlobalStoragePath(), 'maven', 'latest');
	const mavenExePathOld = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
	let mavenExePathNew = await validate(homeDir, mavenExePathOld);
	try {
		mavenExePathNew = await httpget(homeDir, mavenExePathNew);
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed download Maven.', e, e?.request?.path);
	}
	if (mavenExePathOld !== mavenExePathNew) {
		await userSettings.update(CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathNew);
	}
}

async function validate(
	homeDir:string,
	mavenExePath:string | undefined): Promise<string | undefined> {

	if (mavenExePath) {
		const fixedPath = fixPath(mavenExePath);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePath);
			mavenExePath = undefined; // Remove config entry
		} else {
			if (fixedPath !== mavenExePath) {
				log.info(`Fix ${CONFIG_KEY_MAVEN_EXE_PATH}\n   ${mavenExePath}\n-> ${fixedPath}`);
			}
			mavenExePath = fixedPath;
			if (system.isUserInstalled(mavenExePath)) {
				log.info('Available Maven (User installed)', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePath);
				return mavenExePath;
			}
		}
	}
	if (!mavenExePath) {
		const exeSystemPath = await system.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return mavenExePath; // Don't set config (Setting > mvnw > PATH)
		}
		if (isValidHome(homeDir)) {
			mavenExePath = getExePath(homeDir);
		}
	}
	return mavenExePath;
}

async function httpget(
	homeDir:string,
	mavenExePath:string | undefined): Promise<string | undefined> {

    // Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = xml.match(/<version>\d+\.\d+\.\d+<\/version>/g).at(-1) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const versionFile = path.join(homeDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && isValidHome(homeDir)) {
		const mdate = system.mdateSync(versionFile);
		log.info(`Available Maven ${version} (Updated ${mdate})`);
		return mavenExePath;
	}

    // Download
	await httpClient.execute({
		url: `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`,
		storeTempFile: homeDir + '_download_tmp.tar.gz',
		extractDestDir: homeDir,
		targetMessage: `Maven ${version}`,
	});
	if (!isValidHome(homeDir)) {
		log.info('Invalid Maven:', homeDir);
		mavenExePath = undefined; // Remove config entry
		return mavenExePath; // Silent
	}
	fs.writeFileSync(versionFile, version); // Sync for catch

	// Set Settings
	mavenExePath = getExePath(homeDir);
	return mavenExePath;
}

function isValidHome(homeDir:string) {
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
