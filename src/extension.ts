import * as vscode from 'vscode';
import * as fs from 'fs'
import * as path from 'path'
import * as stream from 'stream';
import { promisify } from 'util';
import * as decompress from 'decompress';
import axios from 'axios';

const TARGET_JAVA_VERSIONS = [8, 11, 17];
// const TARGET_JAVA_VERSIONS = [8];
const DEFAULT_JAVA_VERSION = TARGET_JAVA_VERSIONS[TARGET_JAVA_VERSIONS.length - 1];

export function deactivate() {
	console.info('[Pleiades] Called deactivate');
}

export function activate(context:vscode.ExtensionContext) {
	console.info('[Pleiades] Called activate');
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

		for (const javaVersion of TARGET_JAVA_VERSIONS) {
			if (process.arch === 'arm64' && javaVersion === 8) {
				osArch = 'x64_mac_hotspot';
			}
			try {
				downloadJdk(context, javaVersion, osArch);
			} catch (e:any) {

				let message = 'JDK download failed. ';
				if (e.message) message += e.message + ' ';
				if (e.request && e.request.path) message += e.request.path;
				if (message.length == 0) {
					console.error(e);
					message += e;
				}
				vscode.window.showErrorMessage(message);
			}
		}
	} else {
		vscode.window.showErrorMessage('Unable to download JDK due to unsupported OS or architecture.');
		return;
	}
}

async function downloadJdk(context:vscode.ExtensionContext, javaVersion:number, osArch:string): Promise<void> {
	const URL_PREFIX = 'https://github.com/adoptium';
	const response = await axios.get(`${URL_PREFIX}/temurin${javaVersion}-binaries/releases/latest`)
	const redirectedUrl:string = response.request.res.responseUrl;
	const verDirName = redirectedUrl.replace(/.+tag\//, '');
	const p1 = verDirName.replace('+', '%2B');
	const p2 = verDirName.replace('+', '_').replace(/(jdk|-)/g, '');

	const downloadUrlPrefix = `${URL_PREFIX}/temurin${javaVersion}-binaries/releases/download/${p1}/`;
	const fileName = `OpenJDK${javaVersion}U-jdk_${osArch}_${p2}.${osArch.includes('windows') ? 'zip' : 'tar.gz'}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	console.info('[Pleiades] Downloading... ', downloadUrl);
	
	const userDir = context.globalStorageUri.fsPath;
	if (!fs.existsSync(userDir)) {
		fs.mkdirSync(userDir);
	}
	const jdkDir = path.join(userDir, String(javaVersion));
	const outFilePath = jdkDir + '.tmp';
	// const writer = fs.createWriteStream(outFilePath);
	// const res = await axios.get(downloadUrl, {responseType: 'stream'});
	// res.data.pipe(writer);
	// await promisify(stream.finished)(writer);
	console.info('[Pleiades] Saved. ', outFilePath);

	await decompress(outFilePath, userDir, {
		map: file => {
			file.path = file.path.replace(/^[^\/]+/, String(javaVersion));
			return file;
		}
	});

	const RUNTIMES_KEY = 'java.configuration.runtimes';
	const runtimeVersion = 'JavaSE-' + (javaVersion === 8 ? 1.8 : javaVersion);
	const conf = vscode.workspace.getConfiguration();
	const runtimes:any[] = conf.get(RUNTIMES_KEY) || [];

	let targetRuntime = runtimes.find(r => r.name === runtimeVersion);
	if (targetRuntime == null) {
		targetRuntime = {
			name: runtimeVersion,
			default: javaVersion === DEFAULT_JAVA_VERSION,
		};
		if (targetRuntime.default) {
			runtimes.forEach(r => r.default = false);
		}
		runtimes.push(targetRuntime);
	}
	targetRuntime.path = jdkDir;
	console.info('[Pleiades]', runtimes);

	// conf.update(RUNTIMES_KEY, runtimes, vscode.ConfigurationTarget.Global);
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
