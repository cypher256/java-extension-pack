/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as httpClient from '../httpClient';
import * as system from '../system';
import { log } from '../system';
import * as userSettings from '../userSettings';
export const CONFIG_KEY_GRADLE_HOME = 'java.import.gradle.home';

/**
 * Downloads and installs the Gradle if it is not already installed.
 * @return A promise that resolves when the Gradle is installed.
 */
export async function download() {
	const latestDir = getLatestDir();
	const gradleHomeOld = userSettings.get<string>(CONFIG_KEY_GRADLE_HOME);
	let gradleHomeNew = await validate(latestDir, gradleHomeOld);
	try {
		gradleHomeNew = await httpget(latestDir, gradleHomeNew);
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed download Gradle.', e, e?.request?.path);
	}
	if (gradleHomeOld !== gradleHomeNew) {
		await userSettings.update(CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
	}
}

/**
 * Returns true if Gradle is auto-updated with auto-downloaded path.
 * @returns true if the Gradle path is auto-updated.
 */
export function isAutoUpdate(): boolean {
	return system.equalsPath(getLatestDir(), userSettings.get<string>(CONFIG_KEY_GRADLE_HOME));
}

function getLatestDir(): string {
	return path.join(system.getGlobalStoragePath(), 'gradle', 'latest');
}

async function validate(
	latestDir:string,
	configGradleHome:string | undefined): Promise<string | undefined> {

	if (configGradleHome) {
		const fixedPath = fixPath(configGradleHome);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_GRADLE_HOME, configGradleHome);
			configGradleHome = undefined; // Remove config entry
		} else {
			if (fixedPath !== configGradleHome) {
				log.info(`Fix ${CONFIG_KEY_GRADLE_HOME}\n   ${configGradleHome}\n-> ${fixedPath}`);
			}
			configGradleHome = fixedPath;
			if (system.isUserInstalled(configGradleHome)) {
				log.info('Available Gradle (User installed)', CONFIG_KEY_GRADLE_HOME, configGradleHome);
				return configGradleHome;
			}
		}
	}
	if (!configGradleHome) {
		// Ignore system paths to always keep up to date
		/*
		const exeSystemPath = await system.whichPath('gradle');
		if (exeSystemPath) {
			log.info('Available Gradle (PATH)', exeSystemPath);
			return configGradleHome; // Don't set config (gradlew > Setting > PATH > GRADLE_HOME)
		}
		*/
		if (existsExe(latestDir)) {
			configGradleHome = latestDir;
		}
		// This setting is ignored if gradlew is exists
	}
	return configGradleHome;
}

async function httpget(
	latestDir:string,
	configGradleHome:string | undefined): Promise<string | undefined> {

    // Get Latest Version
	const json = (await axios.get('https://services.gradle.org/versions/current')).data;
	const version = json.version;

	// Check Version File
	const versionFile = path.join(latestDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && existsExe(latestDir)) {
		const mdate = system.mdateSync(versionFile);
		log.info(`Available Gradle ${version} (Updated ${mdate})`);
		return configGradleHome;
	}

    // Download
	await httpClient.execute({
		url: json.downloadUrl,
		storeTempFile: latestDir + '_download_tmp.zip',
		extractDestDir: latestDir,
		targetMessage: `Gradle ${version}`,
	});
	if (!existsExe(latestDir)) {
		log.info('Invalid Gradle:', latestDir);
		configGradleHome = undefined; // Remove config entry
		return configGradleHome; // Silent
	}
	fs.writeFileSync(versionFile, version); // Sync for catch

	// Set Settings
	configGradleHome = latestDir;
	return configGradleHome;
}

function existsExe(homeDir:string) {
    return system.existsFile(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'gradle');
}

function fixPath(homeDir:string): string | undefined {
	const MAX_UPPER_LEVEL = 2; // e.g. /xxx/bin/gradle -> /xxx
	let d = homeDir;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (existsExe(d)) {return d;};
		d = path.join(d, '..');
	}
	return undefined;
}
