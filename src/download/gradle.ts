/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as httpClient from '../httpClient';
import * as settings from '../settings';
import * as system from '../system';
import { log } from '../system';
export const CONFIG_NAME_GRADLE_HOME = 'java.import.gradle.home';

/**
 * @returns Whether the Gradle extension is installed.
 */
export function hasExtension(): boolean {
	return vscode.extensions.getExtension(
		// Configuration is provided by RedHat extension rather than Gradle extension
		//'vscjava.vscode-gradle'
		'redhat.java'
		) !== undefined;
}

/**
 * @returns The bin directory path based on workspace configuration.
 */
export async function getWorkspaceBinDir(): Promise<string | undefined> {
	const gradleHome = settings.getWorkspace<string>(CONFIG_NAME_GRADLE_HOME);
	return system.joinPathIfPresent(gradleHome, 'bin');
}

/**
 * Downloads and installs the Gradle if it is not already installed.
 * @returns A promise that resolves when the Gradle is installed.
 */
export async function download() {
	if (!hasExtension()) {
		return;
	}
	const gradleHomeOld = settings.getUser<string>(CONFIG_NAME_GRADLE_HOME);
	let gradleHomeNew = await resolvePath(gradleHomeOld);
	if (gradleHomeNew && system.isUserInstalled(gradleHomeNew)) {
		log.info('Available Gradle (User installed)', CONFIG_NAME_GRADLE_HOME, gradleHomeNew);
	} else {
		try {
			gradleHomeNew = await httpget();
		} catch (e:any) {
			// Silent: offline, 404, 503 proxy auth error, or etc.
			log.info('Failed download Gradle.', e);
		}
	}
	if (gradleHomeOld !== gradleHomeNew) {
		// Preferred over toolchains in build.gradle
		await settings.update(CONFIG_NAME_GRADLE_HOME, gradleHomeNew);
	}
	// Note: This setting is ignored if gradlew is exists
}

function getDownloadDir(): string {
	return system.getGlobalStoragePath('gradle', 'latest');
}

async function resolvePath(configGradleHome:string | undefined): Promise<string | undefined> {
	if (configGradleHome) {
		const fixedPath = fixPath(configGradleHome);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_NAME_GRADLE_HOME, configGradleHome);
			configGradleHome = undefined; // Fallback to auto-download
		} else {
			if (fixedPath !== configGradleHome) {
				log.info(`Fix ${CONFIG_NAME_GRADLE_HOME}\n   ${configGradleHome}\n-> ${fixedPath}`);
			}
			configGradleHome = fixedPath;
		}
	}
	if (!configGradleHome) {
		/*
		const exeSystemPath = await system.whichPath('gradle');
		if (exeSystemPath) {
			log.info('Available Gradle (PATH)', exeSystemPath);
			return undefined; // Don't set config (gradlew > Setting > PATH > GRADLE_HOME)
		}
		*/
		// If undefined, restore from downloaded (Fallback for http connect failures)
		const downloadDir = getDownloadDir();
		if (existsExe(downloadDir)) {
			return downloadDir;
		}
	}
	return configGradleHome; // undefined at first download
}

async function httpget(): Promise<string | undefined> {

	// Get Latest Version
	const json = (await axios.get('https://services.gradle.org/versions/current')).data;
	const version = json.version;

	// Check Version File
	const downloadDir = getDownloadDir();
	const versionFile = path.join(downloadDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && existsExe(downloadDir)) {
		const mdate = system.getLastModified(versionFile);
		log.info(`Available Gradle ${version} (Updated ${mdate})`);
		return downloadDir;
	}

    // Download
	await httpClient.get({
		url: json.downloadUrl,
		storeTempFile: downloadDir + '_download_tmp.zip',
		extractDestDir: downloadDir,
		targetMessage: `Gradle ${version}`,
	});
	
	// Validate
	if (!existsExe(downloadDir)) {
		log.info('Failed download Gradle:', downloadDir);
		return undefined; // Silent: Remove config entry
	}
	fs.writeFileSync(versionFile, version); // Sync for catch
	return downloadDir;
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
