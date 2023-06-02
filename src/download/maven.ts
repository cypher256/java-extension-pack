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

export async function download(progress:vscode.Progress<any>) {

	const storageMavenDir = path.join(jdkcontext.getGlobalStoragePath(), 'maven');
    const homeDirName = 'latest';
	const homeDir = path.join(storageMavenDir, homeDirName);

	// Skip User Installed
	const config = vscode.workspace.getConfiguration();
	const mavenExePath = config.get<string>(CONFIG_KEY_GUI_MAVEN_EXE_PATH);
	if (mavenExePath) {
		if (!fs.existsSync(mavenExePath)) {
			log.info('Remove invalid settings', CONFIG_KEY_GUI_MAVEN_EXE_PATH, mavenExePath);
			jdksettings.removeEntry(CONFIG_KEY_GUI_MAVEN_EXE_PATH);
		} else if (jdkcontext.isUserInstalled(mavenExePath)) {
			log.info('No download Maven (User installed)', CONFIG_KEY_GUI_MAVEN_EXE_PATH, mavenExePath);
			return;
		}
	}
	try {
		const systemMvnPath = await which('mvn');
		if (systemMvnPath) {
			log.info('Maven in path variable', systemMvnPath);
			return;
		}
	} catch (error) {
		// Not found in path
	}
	if (!config.get(CONFIG_KEY_GUI_MAVEN_EXE_PATH) && isValidMavenHome(homeDir)) {
		jdksettings.updateEntry(CONFIG_KEY_GUI_MAVEN_EXE_PATH, getMavenExePath(homeDir));
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
		return;
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
		jdksettings.removeEntry(CONFIG_KEY_GUI_MAVEN_EXE_PATH);
		return; // Silent
	}
	jdkcontext.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, version);

	// Set Settings
	jdksettings.updateEntry(CONFIG_KEY_GUI_MAVEN_EXE_PATH, getMavenExePath(homeDir));
}

function isValidMavenHome(homeDir:string) {
    return fs.existsSync(getMavenExePath(homeDir));
}

function getMavenExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'mvn');
}
