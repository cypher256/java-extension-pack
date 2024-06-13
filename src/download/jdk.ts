/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as _ from "lodash";
import * as path from 'path';
import * as httpClient from '../httpClient';
import * as jdkExplorer from '../jdkExplorer';
import * as redhat from '../redhat';
import * as system from '../system';
import { OS, log } from '../system';

/**
 * true if the current platform is JDK downloadable.
 */
export const isTargetPlatform = apiParamsOf(0) !== undefined;

/**
 * Adoptium API parameters.
 */
interface ApiParams {
	os: string;
	architecture: string;
}

/**
 * @param javaVersion The major version of the JDK.
 * @returns Adoptium API parameters.
 */
function apiParamsOf(javaVersion: number): ApiParams | undefined {
	const isX64 = process.arch === 'x64';
	const isArm64 = process.arch === 'arm64';
	const params = {
		os: '',
		architecture: '',
	};
	if (OS.isWindows) {
		if (isX64 || isArm64 /* mac Parallels Windows */) {
			params.os = 'windows';
			params.architecture = 'x64';
			return params;
		}
	} else if (OS.isMac) {
		params.os = 'mac';
		if (isArm64 && javaVersion >= 11) {
			params.architecture = 'aarch64';
		} else { // javaVersion < 11 is Rosetta
			params.architecture = 'x64';
		}
		return params;
	} else if (OS.isLinux) {
		params.os = 'linux';
		if (isX64) {
			params.architecture = 'x64';
		} else if (isArm64) {
			params.architecture = 'aarch64';
		}
		return params;
	}
	return undefined;
}

/**
 * @param javaConfig The Java configuration.
 * @param majorVer The major version of the JDK.
 * @returns The path of the JDK download directory.
 */
export function getDownloadDir(javaConfig:redhat.IJavaConfig, majorVer:number): string {
	if (javaConfig.latestAvailableVer === majorVer && !redhat.isLtsVersion(majorVer)) {
		return getDownloadLatestDir();
	}
	return system.getGlobalStoragePath('java', String(majorVer));
}

/**
 * @returns The path of the latest non-LTS JDK download directory.
 */
export function getDownloadLatestDir(): string {
	return system.getGlobalStoragePath('java', 'latest');
}

/**
 * Downloads and installs a specific version of the JDK if it is not already installed.
 * @param javaConfig The Java configuration.
 * @param runtimes An array of installed Java runtimes.
 * @param majorVer The major version of the JDK to download.
 * @returns A promise that resolves when the JDK is installed.
 */
export async function download(
	javaConfig: redhat.IJavaConfig,
	runtimes:redhat.JavaConfigRuntimes,
	majorVer:number) {

	// Skip User Installed
	const runtimeName = redhat.nameOf(majorVer);
	const matchedRuntime = runtimes.findByName(runtimeName);
	if (matchedRuntime && system.isUserInstalled(matchedRuntime.path)) {
		jdkExplorer.findByPath(matchedRuntime.path).then(detectedJdk => {
			const ver = detectedJdk?.fullVersion || majorVer;
			log.info(`Available JDK ${ver} (User installed)`);
		});
		return;
	}

	// Adoptium API
	// https://api.adoptium.net/q/swagger-ui/#/Assets/searchReleases
	const apiRes = {
		downloadUrl: '',
		fullVer: '',
	};
	try {
		const p = apiParamsOf(majorVer);
		if (!p) {
			log.info(`Unsupported platform: ${process.platform}/${process.arch}`);
			return;
		}
		const apiBaseUrl = `https://api.adoptium.net/v3/assets/feature_releases/${majorVer}/ga`;
		const apiUrl = `${apiBaseUrl}?os=${p.os}&architecture=${p.architecture}&image_type=jdk`;
		const json = (await axios.get(apiUrl)).data[0];
		apiRes.downloadUrl = json.binaries[0].package.link;
		apiRes.fullVer = json.release_name;
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed access JDK API.', e);
		return;
	}

	// Check Version File
	const downloadVerDir = getDownloadDir(javaConfig, majorVer);
	const versionFile = path.join(downloadVerDir, 'version.txt');
	if (await jdkExplorer.isValidHome(downloadVerDir)) {
		const mdate = system.getLastModified(versionFile);
		const fullVerOld = system.readString(versionFile) || '';
		log.info(`Available JDK ${fullVerOld.replace(/jdk-?/, '')} (Updated ${mdate})`);
		if (apiRes.fullVer === fullVerOld) {
			return;
		}
	}

	// Download
	const req:httpClient.IHttpClientRequest = {
		url: apiRes.downloadUrl,
		storeTempFile: downloadVerDir + '_download_tmp.' + (OS.isWindows ? 'zip' : 'tar.gz'),
		extractDestDir: downloadVerDir,
		targetMessage: apiRes.fullVer,
		removeLeadingPath: OS.isMac ? 3 : 1, // Remove leading 'jdk-xxx/Contents/Home/' for Mac
		is404Ignore: true,
	};
	await httpClient.get(req);

	if (!await jdkExplorer.isValidHome(downloadVerDir)) {
		log.info('Failed download JDK:', downloadVerDir);
		_.remove(runtimes, {name: runtimeName});
		return; // Silent
	}
	fs.writeFileSync(versionFile, apiRes.fullVer); // Sync for throw

	// Set Runtimes Configuration
	if (matchedRuntime) {
		// Update
		matchedRuntime.path = downloadVerDir;
	} else {
		// Add New
		runtimes.push({name: runtimeName, path: downloadVerDir});
	}
}
