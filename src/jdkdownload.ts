/**
 * Java Extension Pack JDK Auto
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
import * as jdkconfig from './jdkconfig';
import * as jdkscan from './jdkscan';
import * as jdkcontext from './jdkcontext';
const log = jdkcontext.log;

/**
 * Returns true if the current platform is the target platform.
 */
export const isTarget = jdkcontext.isWindows || jdkcontext.isMac || (jdkcontext.isLinux && process.arch === 'x64');

/*+
 * Returns the architecture name of the JDK.
 * @param javaVersion The major version of the JDK.
 * @returns The architecture name of the JDK.
 */
function archOf(javaVersion: number): string {
	if (jdkcontext.isWindows) {
		return 'x64_windows_hotspot';
	} else if (jdkcontext.isMac) {
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
	runtimes:jdkconfig.IConfigRuntime[],
	majorVersion:number, 
	progress:vscode.Progress<any>) {

	const runtimeName = jdkconfig.runtime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && jdkconfig.runtime.isUserInstalled(matchedRuntime.path)) {
		log.info(`No download ${majorVersion} (User installed)`);
		return;
	}

	// Get Download URL
	const URL_PREFIX = `https://github.com/adoptium/temurin${majorVersion}-binaries/releases`;
	const response = await axios.get(`${URL_PREFIX}/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const globalStoragePath = jdkcontext.getGlobalStoragePath();
	const downloadJdkDir = path.join(globalStoragePath, String(majorVersion));

	// Check Version File
	const versionFile = path.join(downloadJdkDir, 'version.txt');
	const fullVersionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (fullVersion === fullVersionOld && await jdkscan.isValidPath(downloadJdkDir)) {
		log.info(`No download ${majorVersion} (No updates)`);
		return;
	}
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/download/${p1}/`;
	const arch = archOf(majorVersion);
	const fileExt = jdkcontext.isWindows ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${fileExt}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	log.info('Downloading...', downloadUrl);
	progress.report({ message: `JDK Auto: ${l10n('Downloading')} ${fullVersion}` });
	if (!fs.existsSync(globalStoragePath)) {
		fs.mkdirSync(globalStoragePath);
	}
	const downloadedFile = downloadJdkDir + '_download_tmp.' + fileExt;
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);

	// Decompress JDK
	log.info('Installing...', downloadedFile);
	progress.report({ message: `JDK Auto: ${l10n('Installing')} ${fullVersion}` });
	rmSync(downloadJdkDir);
	try {
		await decompress(downloadedFile, globalStoragePath, {
			map: file => {
				file.path = file.path.replace(/^[^\/]+/, String(majorVersion));
				if (jdkcontext.isMac) {
					file.path = file.path.replace(/^([0-9]+\/)Contents\/Home\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		log.info('Failed decompress: ' + e); // Validate below
	}
	if (!await jdkscan.isValidPath(downloadJdkDir)) {
		log.info('Invalid jdk directory:', downloadJdkDir);
		_.remove(runtimes, r => r.name === runtimeName);
		return; // Silent
	}
	rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = downloadJdkDir;
	} else {
		runtimes.push({name: runtimeName, path: downloadJdkDir});
	}
	const message = fullVersionOld 
		? `${l10n('UPDATE SUCCESS')} ${runtimeName}: ${fullVersionOld} -> ${fullVersion}`
		: `${l10n('INSTALL SUCCESS')} ${runtimeName}: ${fullVersion}`;
	vscode.window.setStatusBarMessage(`JDK Auto: ${message}`, 15_000);
}

export function rmSync(path:string): void {
	try {
		fs.rmSync(path, {recursive: true, force: true});
	} catch (e) {
		log.info('Failed rmSync: ' + e);
	}
}
