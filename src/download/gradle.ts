/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
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
	try {
		const gradleHomeOld = userSettings.get<string>(CONFIG_KEY_GRADLE_HOME);
		const gradleHomeNew = await downloadProc(gradleHomeOld);
		if (gradleHomeOld !== gradleHomeNew) {
			await userSettings.update(CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
		}
	} catch (error) {
		log.info('Failed download Gradle', error);
	}
}

async function downloadProc(
	gradleHomeOld:string | undefined): Promise<string | undefined> {

	let gradleHomeNew = gradleHomeOld;
	const storageGradleDir = path.join(autoContext.getGlobalStoragePath(), 'gradle');
    const versionDirName = 'latest';
	const homeDir = path.join(storageGradleDir, versionDirName);

	// Skip User Installed
	if (gradleHomeOld) {
		const fixedPath = fixPath(gradleHomeOld);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_GRADLE_HOME, gradleHomeOld);
			gradleHomeNew = undefined;
		} else {
			if (fixedPath !== gradleHomeOld) {
				log.info(`Fix ${CONFIG_KEY_GRADLE_HOME}\n   ${gradleHomeOld}\n-> ${fixedPath}`);
			}
			gradleHomeNew = fixedPath;
			if (autoContext.isUserInstalled(gradleHomeNew)) {
				log.info('Available Gradle (User installed)', CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
				return gradleHomeNew;
			}
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
	const versionOld = autoContext.readString(versionFile);
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
