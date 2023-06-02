/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as decompress from 'decompress';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as jdkcontext from '../jdkcontext';
import * as jdksettings from '../jdksettings';
import which = require('which');
const l10n = vscode.l10n;
const { log } = jdkcontext;
export const CONFIG_KEY_GUI_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * Downloads and installs the Maven if it is not already installed.
 * @param progress A progress object used to report the download and installation progress.
 */
export async function download(progress:vscode.Progress<any>) {
	try {
		const config = vscode.workspace.getConfiguration();
		const mavenExePathOld = config.get<string>(CONFIG_KEY_GUI_MAVEN_EXE_PATH);
		const mavenExePathNew = await downloadProc(progress, mavenExePathOld);
		if (mavenExePathOld !== mavenExePathNew) {
			jdksettings.updateEntry(CONFIG_KEY_GUI_MAVEN_EXE_PATH, mavenExePathNew);
		}
	} catch (error) {
		log.info('Failed download Maven', error);
	}
}

async function downloadProc(
	progress:vscode.Progress<any>,
	mavenExePathOld:string | undefined): Promise<string | undefined> {

	let mavenExePathNew = mavenExePathOld;
	const storageMavenDir = path.join(jdkcontext.getGlobalStoragePath(), 'maven');
    const homeDirName = 'latest';
	const homeDir = path.join(storageMavenDir, homeDirName);

	// Skip User Installed
	if (mavenExePathOld) {
		if (!fs.existsSync(mavenExePathOld)) {
			log.info('Remove invalid settings', CONFIG_KEY_GUI_MAVEN_EXE_PATH, mavenExePathOld);
			mavenExePathNew = undefined;
		} else if (jdkcontext.isUserInstalled(mavenExePathOld)) {
			log.info('No download Maven (User installed)', CONFIG_KEY_GUI_MAVEN_EXE_PATH, mavenExePathOld);
			return mavenExePathOld;
		}
	}
	try {
		const systemMvnPath = await which('mvn');
		if (systemMvnPath) {
			log.info('Detect Maven', systemMvnPath);
			if (!mavenExePathNew) {
				mavenExePathNew = systemMvnPath;
			}
			return mavenExePathNew;
		}
	} catch (error) {
		// Not found in path
		log.info('which', error);
	}
	if (!mavenExePathNew && isValidMavenHome(homeDir)) {
		mavenExePathNew = getMavenExePath(homeDir);
	}

    // Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = _.last(xml.match(/<version>\d+\.\d+\.\d+<\/version>/g)) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const versionFile = path.join(homeDir, 'version.txt');
	const versionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (version === versionOld && isValidMavenHome(homeDir)) {
		log.info(`No download Maven ${version} (No updates)`);
		return mavenExePathNew;
	}

    // Download Maven
	const downloadUrl = `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`;
	log.info('Downloading Maven...', downloadUrl);
	progress.report({ message: `JDK Auto: ${l10n.t('Downloading')} Maven ${version}` });
	jdkcontext.mkdirSync(storageMavenDir);
	const downloadedFile = homeDir + '_download_tmp.tar.gz';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);

	// Decompress JDK
	log.info('Installing Maven...', storageMavenDir);
	progress.report({ message: `JDK Auto: ${l10n.t('Installing')} Maven ${version}` });
	jdkcontext.rmSync(homeDir);
	try {
		await decompress(downloadedFile, storageMavenDir, {
			map: file => {
				file.path = file.path.replace(/^[^/]+/, homeDirName);
				return file;
			}
		});
	} catch (e) {
		log.info('Failed decompress: ' + e); // Validate below
	}
	if (!isValidMavenHome(homeDir)) {
		log.info('Invalid Maven:', homeDir);
		mavenExePathNew = undefined;
		return mavenExePathNew; // Silent
	}
	jdkcontext.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, version);

	// Set Settings
	mavenExePathNew = getMavenExePath(homeDir);
	return mavenExePathNew;
}

function isValidMavenHome(homeDir:string) {
    return fs.existsSync(getMavenExePath(homeDir));
}

function getMavenExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'mvn');
}
