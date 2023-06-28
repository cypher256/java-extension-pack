/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
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
 * @param showDownloadMessage true if the download message is displayed.
 * @return A promise that resolves when the Gradle is installed.
 */
export async function download(showDownloadMessage:boolean) {
	try {
		const gradleHomeOld = userSettings.get<string>(CONFIG_KEY_GRADLE_HOME);
		const gradleHomeNew = await downloadProc(showDownloadMessage, gradleHomeOld);
		if (gradleHomeOld !== gradleHomeNew) {
			await userSettings.update(CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
		}
	} catch (error) {
		log.info('Failed download Gradle', error);
	}
}

async function downloadProc(
	showDownloadMessage:boolean,
	gradleHomeOld:string | undefined): Promise<string | undefined> {

	let gradleHomeNew = gradleHomeOld;
	const storageGradleDir = path.join(autoContext.getGlobalStoragePath(), 'gradle');
    const versionDirName = 'latest';
	const homeDir = path.join(storageGradleDir, versionDirName);

	// Skip User Installed
	if (gradleHomeOld) {
		if (!isValidHome(gradleHomeOld)) {
			log.info('Remove invalid settings', CONFIG_KEY_GRADLE_HOME, gradleHomeOld);
			gradleHomeNew = undefined;
		} else if (autoContext.isUserInstalled(gradleHomeOld)) {
			log.info('Available Gradle (User installed)', CONFIG_KEY_GRADLE_HOME, gradleHomeOld);
			return gradleHomeOld;
		}
	}
	if (!gradleHomeNew) {
		const exeSystemPath = await autoContext.whichPath('gradle');
		if (exeSystemPath) {
			log.info('Available Gradle (PATH)', exeSystemPath);
			return gradleHomeNew; // Don't set config (gradlew > Setting > PATH > GRADLE_HOME)
		}
		if (isValidHome(homeDir)) {
			gradleHomeNew = homeDir;
		}
	}

    // Get Latest Version
	const json = (await axios.get('https://services.gradle.org/versions/current')).data;
	const version = json.version;

	// Check Version File
	const versionFile = path.join(homeDir, 'version.txt');
	const versionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (version === versionOld && isValidHome(homeDir)) {
		log.info(`Available Gradle ${version} (No updates)`);
		return gradleHomeNew;
	}

    // Download
	await downloader.execute({
		downloadUrl: json.downloadUrl,
		downloadedFile: homeDir + '_download_tmp.zip',
		extractDestDir: homeDir,
		targetMessage: `Gradle ${version}`,
		showDownloadMessage: showDownloadMessage,
	});
	if (!isValidHome(homeDir)) {
		log.info('Invalid Gradle:', homeDir);
		gradleHomeNew = undefined;
		return gradleHomeNew; // Silent
	}
	fs.writeFileSync(versionFile, version);

	// Set Settings
	gradleHomeNew = homeDir;
	return gradleHomeNew;
}

function isValidHome(homeDir:string) {
    return fs.existsSync(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'gradle');
}
