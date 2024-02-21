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
		if (isX64 || isArm64 /* mac Parallels Windows */) {
			return 'x64_windows_hotspot';
		}
	} else if (OS.isMac) {
		if (isArm64 && javaVersion >= 11) {
			return 'aarch64_mac_hotspot';
		} else { // javaVersion < 11 is Rosetta
			return 'x64_mac_hotspot';
		}
	} else if (OS.isLinux) {
		if (isX64) {
			return 'x64_linux_hotspot';
		} else if (isArm64) {
			return 'aarch64_linux_hotspot';
		}
	}
	return undefined;
}

/**
 * @param majorVer The major version of the JDK.
 * @returns The path of the JDK download directory.
 */
export function getDownloadDir(majorVer:number): string {
	return system.getGlobalStoragePath('java', String(majorVer));
}

/**
 * Downloads and installs a specific version of the JDK if it is not already installed.
 * @param runtimes An array of installed Java runtimes.
 * @param majorVer The major version of the JDK to download.
 * @returns A promise that resolves when the JDK is installed.
 */
export async function download(
	runtimes:redhat.JavaRuntimeArray,
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
	const arch = archOf(majorVer);
	if (!arch) {
		log.info(`Unsupported platform: ${process.platform}/${process.arch}`);
		return;
	}

	// Get Download URL
	const URL_PREFIX = `https://github.com/adoptium/temurin${majorVer}-binaries/releases`;
	let fullVer = undefined;
	try {
		const response = await axios.get(`${URL_PREFIX}/latest`);
		const redirectedUrl:string = response.request.res.responseUrl;
		fullVer = redirectedUrl.replace(/.+tag\//, '');
	} catch (e:any) {
		// Silent: offline, 404, 503 proxy auth error, or etc.
		log.info('Failed download JDK.', e);
		return;
	}

	// Check Version File
	const homeDir = getDownloadDir(majorVer);
	const versionFile = path.join(homeDir, 'version.txt');
	if (await jdkExplorer.isValidHome(homeDir)) {
		const mdate = system.getLastModified(versionFile);
		const fullVerOld = system.readString(versionFile) || '';
		log.info(`Available JDK ${fullVerOld.replace(/jdk-?/, '')} (Updated ${mdate})`);
		if (fullVer === fullVerOld) {
			return;
		}
	}

	// Resolve Download URL
	const p1 = fullVer.replace('+', '%2B');
	const p2 = fullVer.replace('+', '_').replace(/(jdk|-)/g, '').replace(/\.\d+$/, ''); // 17.0.9_9.1 -> 17.0.9_9
	const downloadUrlPrefix = `${URL_PREFIX}/download/${p1}/`;
	const fileExt = OS.isWindows ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVer}U-jdk_${arch}_${p2}.${fileExt}`;

	const req:httpClient.IHttpClientRequest = {
		url: downloadUrlPrefix + fileName,
		storeTempFile: homeDir + '_download_tmp.' + fileExt,
		extractDestDir: homeDir,
		targetMessage: fullVer,
		removeLeadingPath: OS.isMac ? 3 : 1, // Remove leading 'jdk-xxx/Contents/Home/' for macOS
		is404Ignore: true,
	};

	// Download
	try {
		await httpClient.execute(req);
	} catch (e:any) {
		// Retry fallback previous version: /jdk-17.0.9%2B9.1/ -> /jdk-17.0.9%2B9/
		const fallbackUrl = req.url.replace(/(\.\d+%2B\d+)\.\d+/, '$1');
		if (fallbackUrl !== req.url && e?.response?.status === 404) {
			log.info(`Retry fallback:\n${req.url}\n${fallbackUrl}`);
			req.url = fallbackUrl;
			await httpClient.execute(req);
		} else {
			throw e;
		}
	}
	if (!await jdkExplorer.isValidHome(homeDir)) {
		log.info('Invalid JDK:', homeDir);
		_.remove(runtimes, {name: runtimeName});
		return; // Silent
	}
	fs.writeFileSync(versionFile, fullVer); // Sync for throw

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = homeDir;
	} else {
		runtimes.push({name: runtimeName, path: homeDir});
	}
}

/*
---------------------------------------
JDK URL Format
---------------------------------------

JDK download first URL
https://github.com/adoptium/temurin8-binaries/releases/latest
https://github.com/adoptium/temurin11-binaries/releases/latest
https://github.com/adoptium/temurin17-binaries/releases/latest
https://github.com/adoptium/temurin21-binaries/releases/latest

Redirected URL
https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u362-b09
https://github.com/adoptium/temurin11-binaries/releases/tag/jdk-11.0.18+10
https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.6+10
https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21+35

Download URL
https://github.com/adoptium/
temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_windows_hotspot_8u362b09.zip
temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_mac_hotspot_8u362b09.tar.gz
temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_windows_hotspot_11.0.18_10.zip
temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_mac_hotspot_11.0.18_10.tar.gz
temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_windows_hotspot_17.0.6_10.zip
temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_mac_hotspot_17.0.6_10.tar.gz
temurin21-binaries/releases/download/jdk-21%2B35/OpenJDK21U-jdk_x64_windows_hotspot_21_35.zip
temurin21-binaries/releases/download/jdk-21%2B35/OpenJDK21U-jdk_x64_mac_hotspot_21_35.tar.gz

+ OpenJDK8U-jdk_aarch64_linux_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_arm_linux_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_ppc64le_linux_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_ppc64_aix_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_sparcv9_solaris_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_x64_alpine-linux_hotspot_8u362b09.tar.gz
+ OpenJDK8U-jdk_x64_linux_hotspot_8u362b09.tar.gz
+ OpenJDK8U-jdk_x64_mac_hotspot_8u362b09.tar.gz
  OpenJDK8U-jdk_x64_solaris_hotspot_8u362b09.tar.gz
+ OpenJDK8U-jdk_x64_windows_hotspot_8u362b09.zip
  OpenJDK8U-jdk_x86-32_windows_hotspot_8u362b09.zip
  
+ OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.6_10.tar.gz
+ OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.6_10.tar.gz
  OpenJDK17U-jdk_arm_linux_hotspot_17.0.6_10.tar.gz
  OpenJDK17U-jdk_ppc64le_linux_hotspot_17.0.6_10.tar.gz
  OpenJDK17U-jdk_ppc64_aix_hotspot_17.0.6_10.tar.gz
  OpenJDK17U-jdk_s390x_linux_hotspot_17.0.6_10.tar.gz
  OpenJDK17U-jdk_x64_alpine-linux_hotspot_17.0.6_10.tar.gz
+ OpenJDK17U-jdk_x64_linux_hotspot_17.0.6_10.tar.gz
+ OpenJDK17U-jdk_x64_mac_hotspot_17.0.6_10.tar.gz
+ OpenJDK17U-jdk_x64_windows_hotspot_17.0.6_10.zip
  OpenJDK17U-jdk_x86-32_windows_hotspot_17.0.6_10.zip

    /jdk-17.0.9%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip
  /jdk-17.0.9%2B9.1/OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip
*/
