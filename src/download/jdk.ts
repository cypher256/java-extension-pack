/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as fs from 'fs';
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import * as autoContext from '../autoContext';
import { OS, log } from '../autoContext';
import * as jdkExplorer from '../jdkExplorer';
import * as userSettings from '../userSettings';

/**
 * true if the current platform is JDK downloadable.
 */
export const isTargetPlatform = archOf(0) !== undefined;

/**
 * Get the architecture name used as part of the download URL.
 * @param javaVersion The major version of the JDK.
 * @returns The architecture name. undefined if the current platform is not JDK downloadable.
 */
function archOf(javaVersion: number): string | undefined {
	const isX64 = process.arch === 'x64';
	const isArm64 = process.arch === 'arm64';
	if (OS.isWindows) {
		if (isX64) {
			return 'x64_windows_hotspot';
		}
	} else if (OS.isMac) {
		if (isArm64 && javaVersion >= 11) {
			return 'aarch64_mac_hotspot';
		} else { // javaVersion < 11 is Rosetta
			return 'x64_mac_hotspot';
		}
	} else if (OS.isLinux) {
		if (isArm64) {
			return 'aarch64_linux_hotspot';
		} else if (isX64) {
			return 'x64_linux_hotspot';
		}
	}
	return undefined;
}

/**
 * Downloads and installs a specific version of the JDK if it is not already installed.
 * @param runtimes An array of installed Java runtimes.
 * @param majorVersion The major version of the JDK to download.
 * @param progress A progress object used to report the download and installation progress.
 */
export async function download(
	runtimes:userSettings.IJavaRuntime[],
	majorVersion:number,
	progress:vscode.Progress<any>) {

	// Skip User Installed
	const runtimeName = userSettings.JavaRuntime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && autoContext.isUserInstalled(matchedRuntime.path)) {
		log.info(`Available JDK ${majorVersion} (User installed)`);
		return;
	}
	const arch = archOf(majorVersion);
	if (!arch) {
		throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
	}

	// Get Download URL
	const URL_PREFIX = `https://github.com/adoptium/temurin${majorVersion}-binaries/releases`;
	const response = await axios.get(`${URL_PREFIX}/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const storageJavaDir = path.join(autoContext.getGlobalStoragePath(), 'java');
	const versionDir = path.join(storageJavaDir, String(majorVersion));

	// Check Version File
	const versionFile = path.join(versionDir, 'version.txt');
	const fullVersionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (fullVersion === fullVersionOld && await jdkExplorer.isValidPath(versionDir)) {
		log.info(`Available JDK ${fullVersion.replace(/jdk-?/, '')} (No updates)`);
		return;
	}

	// Resolve Download URL
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/download/${p1}/`;
	const fileExt = OS.isWindows ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${fileExt}`;

	// Download
	const downloadUrl = downloadUrlPrefix + fileName;
	const downloadedFile = versionDir + '_download_tmp.' + fileExt;
	await autoContext.download(downloadUrl, downloadedFile, progress, fullVersion);
	await autoContext.extract(downloadedFile, versionDir, progress, fullVersion);
	if (!await jdkExplorer.isValidPath(versionDir)) {
		log.info('Invalid JDK:', versionDir);
		_.remove(runtimes, r => r.name === runtimeName);
		return; // Silent
	}
	autoContext.rm(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = versionDir;
	} else {
		runtimes.push({name: runtimeName, path: versionDir});
	}
}
