/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as downloader from '../downloader';
import * as settings from '../settings';
import * as system from '../system';
import { log } from '../system';
export const CONFIG_NAME_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * @returns Whether the Maven extension is installed.
 */
export function hasExtension(): boolean {
	return vscode.extensions.getExtension('vscjava.vscode-maven') !== undefined;
}

/**
 * @returns The bin directory path based on workspace configuration.
 */
export async function getWorkspaceBinDir(): Promise<string | undefined> {
	if (hasExtension() && settings.getWorkspace(settings.AUTO_CONFIG_ENABLED)) {
		const mavenExeOld = settings.getUserDefine<string>(CONFIG_NAME_MAVEN_EXE_PATH);
		if (mavenExeOld) {
			const mavenExeNew = await resolvePath(mavenExeOld);
			if (mavenExeNew && mavenExeNew !== mavenExeOld) {
				await settings.update(CONFIG_NAME_MAVEN_EXE_PATH, mavenExeNew);
			}
		}
	}
	const workspaceResolved = settings.getWorkspace<string>(CONFIG_NAME_MAVEN_EXE_PATH);
	return system.joinPathIfPresent(workspaceResolved, '..');
}

/**
 * Downloads and installs the Maven if it is not already installed.
 * @returns A promise that resolves when the Maven is installed.
 */
export async function download() {
	if (!hasExtension()) {
		return;
	}
	// Use 'getUserDefine' instead of 'getUserOrDefault' to get empty definition
	const mavenExeOld = settings.getUserDefine<string>(CONFIG_NAME_MAVEN_EXE_PATH);
	if (mavenExeOld === '') {
		log.info('Use mvnw because', CONFIG_NAME_MAVEN_EXE_PATH, 'is empty');
		return;	// Note: mvnw is used only if undefined or empty
	}
	let mavenExeNew = await resolvePath(mavenExeOld);
	if (mavenExeNew && system.isUserInstalled(mavenExeNew)) {
		log.info('Available Maven (User installed)', CONFIG_NAME_MAVEN_EXE_PATH, mavenExeNew);
	} else {
		try {
			mavenExeNew = await httpget();
		} catch (e: any) {
			// Silent: offline, 404, 503 proxy auth error, or etc.
			log.info('Updates Disabled Maven:', e);
		}
	}
	if (mavenExeNew !== mavenExeOld) {
		await settings.update(CONFIG_NAME_MAVEN_EXE_PATH, mavenExeNew); // Remove if undefined
	}
}

function getDownloadDir(): string {
	return system.getGlobalStoragePath('maven', 'latest');
}

async function resolvePath(configMavenExe?: string): Promise<string | undefined> {
	if (configMavenExe) {
		const fixedPath = fixPath(configMavenExe);
		if (!fixedPath) {
			log.info('Invalid Settings', CONFIG_NAME_MAVEN_EXE_PATH, configMavenExe);
			configMavenExe = undefined; // Fallback to auto-download
		} else {
			if (fixedPath !== configMavenExe) {
				log.info(`Fix ${CONFIG_NAME_MAVEN_EXE_PATH}\n- ${configMavenExe}\n+ ${fixedPath}`);
			}
			configMavenExe = fixedPath;
		}
	}
	if (!configMavenExe) {
		/*
		const exeSystemPath = await system.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return undefined; // Don't set config (Setting > mvnw > PATH)
		}
		*/
		// If undefined, restore from downloaded (Fallback for http connect failures)
		const downloadDir = getDownloadDir();
		if (existsExe(downloadDir)) {
			return getExePath(downloadDir);
		}
	}
	return configMavenExe; // undefined at first download
}

async function httpget(): Promise<string | undefined> {

	// Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag: string = xml.match(/<version>\d+\.\d+\.\d+<\/version>/g).at(-1) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const downloadDir = getDownloadDir();
	const versionFile = path.join(downloadDir, 'version.txt');
	const versionOld = system.readString(versionFile);
	if (version === versionOld && existsExe(downloadDir)) {
		const mdate = system.getLastModified(versionFile);
		log.info(`Available Maven ${version} (Updated ${mdate})`);
		return getExePath(downloadDir);
	}

    // Download
	await downloader.execute({
		url: `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`,
		localZipFile: downloadDir + '_download_tmp.tar.gz',
		extractDestDir: downloadDir,
		targetLabel: `Maven ${version}`,
	});
	
	// Validate
	if (!existsExe(downloadDir)) {
		log.info('Failed download Maven:', downloadDir);
		return undefined; // Silent: Remove config entry
	}
	fs.writeFileSync(versionFile, version); // Sync for catch
	return getExePath(downloadDir);
}

function existsExe(homeDir: string) {
    return system.existsFile(getExePath(homeDir));
}

function getExePath(homeDir: string) {
	return path.join(homeDir, 'bin', 'mvn');
}

function fixPath(exePath: string): string | undefined {
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
