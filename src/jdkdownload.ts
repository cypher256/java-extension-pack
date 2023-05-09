/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
const l10n = vscode.l10n.t;
import * as fs from 'fs';
import * as path from 'path';
import * as decompress from 'decompress';
import * as stream from 'stream';
import * as _ from "lodash";
import axios from 'axios';
import { promisify } from 'util';
import * as jdksettings from './jdksettings';
import * as jdkscan from './jdkscan';
import * as jdkcontext from './jdkcontext';
const { log, OS } = jdkcontext;

/**
 * true if the current platform is JDK downloadable.
 */
export const isTarget = OS.isWindows || OS.isMac || (OS.isLinux && process.arch === 'x64');

/*+
 * Get the architecture name used as part of the download URL.
 * @param javaVersion The major version of the JDK.
 * @returns The architecture name.
 */
function archOf(javaVersion: number): string {
	if (OS.isWindows) {
		return 'x64_windows_hotspot';
	} else if (OS.isMac) {
		if (process.arch === 'arm64' && javaVersion >= 11) {
			return 'aarch64_mac_hotspot';
		} else {
			return 'x64_mac_hotspot';
		}
	} else {
		return 'x64_linux_hotspot';
	}
}

/**
 * Downloads and installs a specific version of the JDK if it is not already installed.
 * @param runtimes An array of installed Java runtimes.
 * @param majorVersion The major version of the JDK to download.
 * @param progress A progress object used to report the download and installation progress.
 */
export async function download(
	runtimes:jdksettings.IConfigRuntime[],
	majorVersion:number, 
	progress:vscode.Progress<any>) {

	const runtimeName = jdksettings.runtime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && jdksettings.runtime.isUserInstalled(matchedRuntime.path)) {
		log.info(`No download ${majorVersion} (User installed)`);
		return;
	}

	// Get Download URL
	const URL_PREFIX = `https://github.com/adoptium/temurin${majorVersion}-binaries/releases`;
	const response = await axios.get(`${URL_PREFIX}/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const storageJavaDir = path.join(jdkcontext.getGlobalStoragePath(), 'java');
	const versionDir = path.join(storageJavaDir, String(majorVersion));

	// Check Version File
	const versionFile = path.join(versionDir, 'version.txt');
	const fullVersionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (fullVersion === fullVersionOld && await jdkscan.isValidPath(versionDir)) {
		log.info(`No download ${majorVersion} (No updates)`);
		return;
	}

	// Resolve Download URL
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/download/${p1}/`;
	const arch = archOf(majorVersion);
	const fileExt = OS.isWindows ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${fileExt}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	log.info('Downloading...', downloadUrl);
	progress.report({ message: `JDK Auto: ${l10n('Downloading')} ${fullVersion}` });
	jdkcontext.mkdirSync(storageJavaDir);
	const downloadedFile = versionDir + '_download_tmp.' + fileExt;
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);

	// Decompress JDK
	log.info('Installing...', downloadedFile);
	progress.report({ message: `JDK Auto: ${l10n('Installing')} ${fullVersion}` });
	jdkcontext.rmSync(versionDir);
	try {
		await decompress(downloadedFile, storageJavaDir, {
			map: file => {
				file.path = file.path.replace(/^[^/]+/, String(majorVersion));
				if (OS.isMac) {
					file.path = file.path.replace(/^(\d+\/)Contents\/Home\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		log.info('Failed decompress: ' + e); // Validate below
	}
	if (!await jdkscan.isValidPath(versionDir)) {
		log.info('Invalid JDK:', versionDir);
		_.remove(runtimes, r => r.name === runtimeName);
		return; // Silent
	}
	jdkcontext.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = versionDir;
	} else {
		runtimes.push({name: runtimeName, path: versionDir});
	}
	const message = fullVersionOld 
		? `${l10n('UPDATE SUCCESS')} ${runtimeName}: ${fullVersionOld} -> ${fullVersion}`
		: `${l10n('INSTALL SUCCESS')} ${runtimeName}: ${fullVersion}`;
	vscode.window.setStatusBarMessage(`JDK Auto: ${message}`, 15_000);
}
