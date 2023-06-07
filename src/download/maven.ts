/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as vscode from 'vscode';
import * as autoContext from '../autoContext';
import { log } from '../autoContext';
import * as userSettings from '../userSettings';
export const CONFIG_KEY_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * Downloads and installs the Maven if it is not already installed.
 * @param progress A progress object used to report the download and installation progress.
 */
export async function download(progress:vscode.Progress<any>) {
	try {
		const config = vscode.workspace.getConfiguration();
		const mavenExePathOld = config.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
		const mavenExePathNew = await downloadProc(progress, mavenExePathOld);
		if (mavenExePathOld !== mavenExePathNew) {
			await userSettings.update(CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathNew);
		}
	} catch (error) {
		log.info('Failed download Maven', error);
	}
}

async function downloadProc(
	progress:vscode.Progress<any>,
	mavenExePathOld:string | undefined): Promise<string | undefined> {

	let mavenExePathNew = mavenExePathOld;
	const storageMavenDir = path.join(autoContext.getGlobalStoragePath(), 'maven');
    const versionDirName = 'latest';
	const versionDir = path.join(storageMavenDir, versionDirName);

	// Skip User Installed
	if (mavenExePathOld) {
		if (!fs.existsSync(mavenExePathOld)) {
			log.info('Remove invalid settings', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathOld);
			mavenExePathNew = undefined;
		} else if (autoContext.isUserInstalled(mavenExePathOld)) {
			log.info('Available Maven (User installed)', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathOld);
			return mavenExePathOld;
		}
	}
	if (!mavenExePathNew) {
		const exeSystemPath = await autoContext.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return mavenExePathNew; // Don't set config (Setting > mvnw > PATH)
		}
		if (isValidHome(versionDir)) {
			mavenExePathNew = getExePath(versionDir);
		}
	}

    // Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = _.last(xml.match(/<version>\d+\.\d+\.\d+<\/version>/g)) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const versionFile = path.join(versionDir, 'version.txt');
	const versionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (version === versionOld && isValidHome(versionDir)) {
		log.info(`Available Maven ${version} (No updates)`);
		return mavenExePathNew;
	}

    // Download
	const downloadUrl = `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`;
	const downloadedFile = versionDir + '_download_tmp.tar.gz';
	await autoContext.download(downloadUrl, downloadedFile, progress, `Maven ${version}`);
	await autoContext.extract(downloadedFile, versionDir, progress, `Maven ${version}`);
	if (!isValidHome(versionDir)) {
		log.info('Invalid Maven:', versionDir);
		mavenExePathNew = undefined;
		return mavenExePathNew; // Silent
	}
	autoContext.rm(downloadedFile);
	fs.writeFileSync(versionFile, version);

	// Set Settings
	mavenExePathNew = getExePath(versionDir);
	return mavenExePathNew;
}

function isValidHome(homeDir:string) {
    return fs.existsSync(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'mvn');
}
