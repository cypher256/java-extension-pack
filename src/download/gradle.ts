/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as autoContext from '../autoContext';
import { log } from '../autoContext';
import * as downloader from '../downloader';
import * as userSettings from '../userSettings';
export const CONFIG_KEY_GRADLE_HOME = 'java.import.gradle.home';

/**
 * Downloads and installs the Gradle if it is not already installed.
 * @return A promise that resolves when the Gradle is installed.
 */
export async function execute() {
	const homeDir = path.join(autoContext.getGlobalStoragePath(), 'gradle', 'latest');
	const gradleHomeOld = userSettings.get<string>(CONFIG_KEY_GRADLE_HOME);
	let gradleHomeNew = await validate(homeDir, gradleHomeOld);
	try {
		gradleHomeNew = await download(homeDir, gradleHomeNew);
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed download Gradle.', e, e?.request?.path);
	}
	if (gradleHomeOld !== gradleHomeNew) {
		await userSettings.update(CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
	}
}

async function validate(
	homeDir:string,
	gradleHome:string | undefined): Promise<string | undefined> {

	if (gradleHome) {
		const fixedPath = fixPath(gradleHome);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_GRADLE_HOME, gradleHome);
			gradleHome = undefined; // Remove config entry
		} else {
			if (fixedPath !== gradleHome) {
				log.info(`Fix ${CONFIG_KEY_GRADLE_HOME}\n   ${gradleHome}\n-> ${fixedPath}`);
			}
			gradleHome = fixedPath;
			if (autoContext.isUserInstalled(gradleHome)) {
				log.info('Available Gradle (User installed)', CONFIG_KEY_GRADLE_HOME, gradleHome);
				return gradleHome;
			}
		}
	}
	if (!gradleHome) {
		const exeSystemPath = await autoContext.whichPath('gradle');
		if (exeSystemPath) {
			log.info('Available Gradle (PATH)', exeSystemPath);
			return gradleHome; // Don't set config (gradlew > Setting > PATH > GRADLE_HOME)
		}
		if (isValidHome(homeDir)) {
			gradleHome = homeDir;
		}
	}
	return gradleHome;
}

async function download(
	homeDir:string,
	gradleHome:string | undefined): Promise<string | undefined> {

    // Get Latest Version
	const json = (await axios.get('https://services.gradle.org/versions/current')).data;
	const version = json.version;

	// Check Version File
	const versionFile = path.join(homeDir, 'version.txt');
	const versionOld = autoContext.readString(versionFile);
	if (version === versionOld && isValidHome(homeDir)) {
		const mdate = autoContext.mdateSync(versionFile);
		log.info(`Available Gradle ${version} (Updated ${mdate})`);
		return gradleHome;
	}

    // Download
	await downloader.execute({
		downloadUrl: json.downloadUrl,
		downloadedFile: homeDir + '_download_tmp.zip',
		extractDestDir: homeDir,
		targetMessage: `Gradle ${version}`,
	});
	if (!isValidHome(homeDir)) {
		log.info('Invalid Gradle:', homeDir);
		gradleHome = undefined; // Remove config entry
		return gradleHome; // Silent
	}
	fs.writeFileSync(versionFile, version); // Sync for catch

	// Set Settings
	gradleHome = homeDir;
	return gradleHome;
}

function isValidHome(homeDir:string) {
    return autoContext.existsFile(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'gradle');
}

function fixPath(homeDir:string): string | undefined {
	const MAX_UPPER_LEVEL = 2; // e.g. /xxx/bin/gradle -> /xxx
	let d = homeDir;
	for (let i = 0; i <= MAX_UPPER_LEVEL; i++) {
		if (isValidHome(d)) {return d;};
		d = path.join(d, '..');
	}
	return undefined;
}
