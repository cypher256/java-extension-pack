import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as decompress from 'decompress';
import axios from 'axios';

const TARGET_JAVA_VERSIONS = [8, 11, 17];
const DEFAULT_JAVA_VERSION = 17;

export async function activate(context:vscode.ExtensionContext) {
	console.info('[Pleiades] Called activate START', context.globalStorageUri.fsPath);
	if (process.platform.match(/^(win32|darwin)$/) || (process.platform === 'linux' && process.arch === 'x64')) {

		let osArch = 'x64_windows_hotspot';
		if (process.platform === 'darwin') {
			if (process.arch === 'arm64') {
				osArch = 'aarch64_mac_hotspot';
			} else {
				osArch = 'x64_mac_hotspot';
			}
		} else if (process.platform === 'linux') {
			osArch = 'x64_linux_hotspot';
		}

		try {
			const promiseArray: Promise<Boolean>[] = [];
			const config = vscode.workspace.getConfiguration();
			const RUNTIMES_KEY = 'java.configuration.runtimes';
			const runtimes:any[] = config.get(RUNTIMES_KEY) || [];
	
			for (const javaVersion of TARGET_JAVA_VERSIONS) {
				if (process.arch === 'arm64' && javaVersion === 8) {
					osArch = 'x64_mac_hotspot';
				}
				promiseArray.push(
					downloadJdk(context, javaVersion, osArch, runtimes)
				);
			}
	
			const updates = await Promise.all(promiseArray);
			if (updates.includes(true)) {
				if (!runtimes.find(r => r.default)) {
					const defaultRuntime = runtimes.find(r => r.name === 'JavaSE-' + DEFAULT_JAVA_VERSION);
					if (defaultRuntime) {
						defaultRuntime.default = true;
					}
				}
				runtimes.sort((a, b) => a.name.localeCompare(b.name));
				config.update(RUNTIMES_KEY, runtimes, vscode.ConfigurationTarget.Global);
				console.info(`[Pleiades] Updated ${RUNTIMES_KEY}`);
				config.update('java.home', undefined, true);
			}

		} catch (e:any) {

			let message = 'JDK download failed. ';
			if (e.message) {message += e.message + ' ';}
			if (e.request && e.request.path) {message += e.request.path;}
			if (message.length === 0) {
				console.error(e);
				message += e;
			}
			vscode.window.showErrorMessage(message);
		}

	} else {
		vscode.window.showErrorMessage('Unable to download JDK due to unsupported OS or architecture.');
	}
	console.info('[Pleiades] Called activate END');
}

async function downloadJdk(
	context:vscode.ExtensionContext, 
	javaVersion:number, 
	osArch:string, 
	runtimes:any[]): Promise<Boolean> {

	// Get Download URL
	const URL_PREFIX = 'https://github.com/adoptium';
	const response = await axios.get(`${URL_PREFIX}/temurin${javaVersion}-binaries/releases/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');

	const userDir = context.globalStorageUri.fsPath;
	const jdkDir = path.join(userDir, String(javaVersion));
	const versionFile = path.join(jdkDir, 'version.txt');
	let fullVersionOld = null;
	if (fs.existsSync(versionFile)) {
		fullVersionOld = fs.readFileSync(versionFile).toString();
		if (fullVersion === fullVersionOld) {
			console.info('[Pleiades] No updates. ', fullVersion);
			return false;
		}
	}
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/temurin${javaVersion}-binaries/releases/download/${p1}/`;
	const fileName = `OpenJDK${javaVersion}U-jdk_${osArch}_${p2}.${osArch.includes('windows') ? 'zip' : 'tar.gz'}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	console.info('[Pleiades] Downloading... ', downloadUrl);
	vscode.window.setStatusBarMessage(`Downloading... ${fullVersion}`, 10_000);
	if (!fs.existsSync(userDir)) {
		fs.mkdirSync(userDir);
	}
	const isMac = process.platform === 'darwin';
	const javaHome = isMac ? path.join(jdkDir, 'Home') : jdkDir;
	const downloadedFile = jdkDir + '.tmp';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);
	console.info('[Pleiades] Saved. ', downloadedFile);

	// Decompress JDK
	vscode.window.setStatusBarMessage(`Installing... ${fullVersion}`, 10_000);
	rmSync(jdkDir, { recursive: true });
	try {
		await decompress(downloadedFile, userDir, {
			map: file => {
				file.path = file.path.replace(/^[^\/]+/, String(javaVersion));
				if (isMac) {
					file.path = file.path.replace(/^([0-9]+\/)Contents\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		console.info('[Pleiades] Failed decompress: ' + e);
	}
	fs.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Configuration
	const runtimeVersion = 'JavaSE-' + (javaVersion === 8 ? 1.8 : javaVersion);
	let matchRuntime = runtimes.find(r => r.name === runtimeVersion);
	if (!matchRuntime) {
		matchRuntime = {name: runtimeVersion};
		runtimes.push(matchRuntime);
	}
	matchRuntime.path = javaHome;
	const message = fullVersionOld 
		? `UPDATE SUCCESSFUL JDK ${runtimeVersion}: ${fullVersionOld} -> ${fullVersion}`
		: `INSTALL SUCCESSFUL JDK ${runtimeVersion}: ${fullVersion}`;
	vscode.window.setStatusBarMessage(message, 10_000);
	return true;
}

function rmSync(path:string, options?:object): void {
	try {
		if (fs.existsSync(path)) {
			fs.rmSync(path, options);
		}
	} catch (e) {
		console.info('[Pleiades] Failed remove: ' + e);
	}
}

/*
JDK download first URL
https://github.com/adoptium/temurin8-binaries/releases/latest
https://github.com/adoptium/temurin11-binaries/releases/latest
https://github.com/adoptium/temurin17-binaries/releases/latest

redirected URL
https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u362-b09
https://github.com/adoptium/temurin11-binaries/releases/tag/jdk-11.0.18+10
https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.6+10

download URL
https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_windows_hotspot_8u362b09.zip
https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_mac_hotspot_8u362b09.tar.gz
https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_windows_hotspot_11.0.18_10.zip
https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_mac_hotspot_11.0.18_10.tar.gz
https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_windows_hotspot_17.0.6_10.zip
https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_mac_hotspot_17.0.6_10.tar.gz

  OpenJDK8U-jdk_aarch64_linux_hotspot_8u362b09.tar.gz
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
  
  OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.6_10.tar.gz
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
*/
