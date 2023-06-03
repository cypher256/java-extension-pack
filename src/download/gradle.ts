/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as decompress from 'decompress';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as jdkcontext from '../jdkcontext';
import * as jdksettings from '../jdksettings';
import which = require('which');
const l10n = vscode.l10n;
const { log } = jdkcontext;
export const CONFIG_KEY_GRADLE_HOME = 'java.import.gradle.home';

/**
 * Downloads and installs the Gradle if it is not already installed.
 * @param progress A progress object used to report the download and installation progress.
 */
export async function download(progress:vscode.Progress<any>) {
	try {
		const config = vscode.workspace.getConfiguration();
		const gradleHomeOld = config.get<string>(CONFIG_KEY_GRADLE_HOME);
		const gradleHomeNew = await downloadProc(progress, gradleHomeOld);
		if (gradleHomeOld !== gradleHomeNew) {
			await jdksettings.updateEntry(CONFIG_KEY_GRADLE_HOME, gradleHomeNew);
		}
	} catch (error) {
		log.info('Failed download Gradle', error);
	}
}

async function downloadProc(
	progress:vscode.Progress<any>,
	gradleHomeOld:string | undefined): Promise<string | undefined> {

	let gradleHomeNew = gradleHomeOld;
	const storageGradleDir = path.join(jdkcontext.getGlobalStoragePath(), 'gradle');
    const versionDirName = 'latest';
	const versionDir = path.join(storageGradleDir, versionDirName);

	// Skip User Installed
	if (gradleHomeOld) {
		if (!isValidHome(gradleHomeOld)) {
			log.info('Remove invalid settings', CONFIG_KEY_GRADLE_HOME, gradleHomeOld);
			gradleHomeNew = undefined;
		} else if (jdkcontext.isUserInstalled(gradleHomeOld)) {
			log.info('No download Gradle (User installed)', CONFIG_KEY_GRADLE_HOME, gradleHomeOld);
			return gradleHomeOld;
		}
	}
	try {
		const systemGradleExe = await which('gradle');
		if (systemGradleExe) {
			log.info('Detect Gradle', systemGradleExe);
			if (!gradleHomeNew) {
				gradleHomeNew = path.join(systemGradleExe, '..', '..');
			}
			return gradleHomeNew;
		}
	} catch (error) {
		log.info('which system path', error);
	}
	if (!gradleHomeNew && isValidHome(versionDir)) {
		gradleHomeNew = versionDir;
	}

    // Get Latest Version
	const json = (await axios.get('https://services.gradle.org/versions/current')).data;
	const version = json.version;

	// Check Version File
	const versionFile = path.join(versionDir, 'version.txt');
	const versionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (version === versionOld && isValidHome(versionDir)) {
		log.info(`No download Gradle ${version} (No updates)`);
		return gradleHomeNew;
	}

    // Download Archive
	const downloadUrl = json.downloadUrl;
	log.info('Downloading Gradle...', downloadUrl);
	progress.report({ message: `JDK Auto: ${l10n.t('Downloading')} Gradle ${version}` });
	jdkcontext.mkdirSync(storageGradleDir);
	const downloadedFile = versionDir + '_download_tmp.zip';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);

	// Decompress Archive
	log.info('Installing Gradle...', storageGradleDir);
	progress.report({ message: `JDK Auto: ${l10n.t('Installing')} Gradle ${version}` });
	jdkcontext.rmSync(versionDir);
	try {
		await decompress(downloadedFile, storageGradleDir, {
			map: file => {
				file.path = file.path.replace(/^[^/]+/, versionDirName);
				return file;
			}
		});
	} catch (e) {
		log.info('Failed decompress: ' + e); // Validate below
	}
	if (!isValidHome(versionDir)) {
		log.info('Invalid Gradle:', versionDir);
		gradleHomeNew = undefined;
		return gradleHomeNew; // Silent
	}
	jdkcontext.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, version);

	// Set Settings
	gradleHomeNew = versionDir;
	return gradleHomeNew;
}

function isValidHome(homeDir:string) {
    return fs.existsSync(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'gradle');
}
