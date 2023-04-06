/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as os from 'os'
import * as fg from 'fast-glob';
import * as _ from "lodash";
import * as decompress from 'decompress';
import axios from 'axios';
import { promisify } from 'util';
import { jdkbundle } from './jdkbundle';

const AVAILABLE_LTS_VERSIONS = [8, 11, 17];
const LATEST_LTS_VERSION = 17;
const JDT_VERSION = LATEST_LTS_VERSION;
const CONFIG_KEY_JAVA_RUNTIMES = 'java.configuration.runtimes';

export async function activate(context:vscode.ExtensionContext) {

	jdkbundle.log('activate START', context.globalStorageUri.fsPath);
	if (!jdkbundle.os.isTarget()) {
		vscode.window.showErrorMessage('Unable to download JDK due to unsupported OS or architecture.');
		return;
	}

	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		const config = vscode.workspace.getConfiguration();
		const runtimes:jdkbundle.JavaRuntime[] = config.get(CONFIG_KEY_JAVA_RUNTIMES) || [];
		const downloadVersions = new Set(AVAILABLE_LTS_VERSIONS);

		try {
			const runtimesOld = _.cloneDeep(runtimes);
			await scanJdk(context, runtimes, downloadVersions);
			updateConfiguration(context, runtimes, runtimesOld);

		} catch (e:any) {
			let message = `JDK scan failed. ${e.message ? e.message : e}`;
			vscode.window.showErrorMessage(message);
			jdkbundle.log(e);
		}

		try {
			const runtimesOld = _.cloneDeep(runtimes);
			const promiseArray: Promise<void>[] = [];
			for (const majorVersion of downloadVersions) {
				promiseArray.push(
					downloadJdk(context, runtimes, majorVersion, progress)
				);
			}
			await Promise.all(promiseArray);
			updateConfiguration(context, runtimes, runtimesOld);

		} catch (e:any) {
			let message = 'JDK download failed.';
			if (e.request?.path) {message += ' ' + e.request.path;}
			message += ` ${e.message ? e.message : e}`;
			vscode.window.showErrorMessage(message);
			jdkbundle.log(e);
		}
		jdkbundle.log('activate END');
	});
}

function updateConfiguration(
	context:vscode.ExtensionContext, 
	runtimes:jdkbundle.JavaRuntime[], 
	runtimesOld:jdkbundle.JavaRuntime[]) {

	const config = vscode.workspace.getConfiguration();
	const updateConfig = (section:string, value:any) => config.update(section, value, vscode.ConfigurationTarget.Global);
	const noneDefault = runtimes.find(r => r.default) ? false : true;

	if (noneDefault || !_.isEqual(runtimes, runtimesOld)) {
		const latestLtsRuntime = runtimes.find(r => r.name === jdkbundle.runtime.nameOf(LATEST_LTS_VERSION));
		if (noneDefault && latestLtsRuntime) {
			latestLtsRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		updateConfig(CONFIG_KEY_JAVA_RUNTIMES, runtimes);
		jdkbundle.log(`Updated ${CONFIG_KEY_JAVA_RUNTIMES}`);
		vscode.window.setStatusBarMessage(`JDK Bundle: ${l10n.t('Updated')} ${CONFIG_KEY_JAVA_RUNTIMES}`, 10_000);
	}

	const jdtRuntimePath = runtimes.find(r => r.name === jdkbundle.runtime.nameOf(JDT_VERSION))?.path;
	if (jdtRuntimePath) {
		const CONFIG_KEY_JDT_JAVA_HOME = 'java.jdt.ls.java.home';
		const jdtJavaHome = config.get(CONFIG_KEY_JDT_JAVA_HOME);
		if (jdtJavaHome !== jdtRuntimePath) {
			// Java Extension prompts to reload dialog
			updateConfig(CONFIG_KEY_JDT_JAVA_HOME, jdtRuntimePath);
			jdkbundle.log(`Updated ${CONFIG_KEY_JDT_JAVA_HOME}`);
			vscode.window.setStatusBarMessage(`JDK Bundle: ${l10n.t('Updated')} ${CONFIG_KEY_JDT_JAVA_HOME}`, 10_000);
		}
	}

	const defaultRuntime = runtimes.find(r => r.default);
	if (!process.env.JAVA_HOME && defaultRuntime) {
		const CONFIG_KEY_JAVA_DOT_HOME = 'java.home';
		const javaDotHome:string = config.get(CONFIG_KEY_JAVA_DOT_HOME) || '';
		if (javaDotHome !== defaultRuntime.path) {
			updateConfig(CONFIG_KEY_JAVA_DOT_HOME, defaultRuntime.path);
			updateConfig('maven.terminal.useJavaHome', true);
			jdkbundle.log(`Updated ${CONFIG_KEY_JAVA_DOT_HOME}`);
		}
	}
}

async function scanJdk(
	context:vscode.ExtensionContext, 
	runtimes:jdkbundle.JavaRuntime[],
	downloadVersions:Set<number>) {

	// Remove configuration where directory does not exist
	for (let i = runtimes.length - 1; i >= 0; i--) {
		if (!fs.existsSync(runtimes[i].path)) { 
			runtimes.splice(i, 1);
		}
	}

	// Get Supported Runtime Names from Red Hat Extension
	const redhat = vscode.extensions.getExtension('redhat.java');
	const redhatProp = redhat?.packageJSON?.contributes?.configuration?.properties;
	const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY_JAVA_RUNTIMES]?.items?.properties?.name?.enum || [];
	if (redhatRuntimeNames.length === 0) {
		redhatRuntimeNames.push(...[...downloadVersions].map(s => jdkbundle.runtime.nameOf(s)));
		jdkbundle.log('Failed getExtension RedHat', redhat);
	} else {
		const latestVersion = jdkbundle.runtime.versionOf(redhatRuntimeNames[redhatRuntimeNames.length - 1]);
		if (latestVersion) {
			jdkbundle.log('RedHat supported latest version:', latestVersion);
			downloadVersions.add(latestVersion);
		}
	}

	// Directories to Scan
	const scanDirs:string[] = jdkbundle.os.isWindows()
		? 
			// Windows
			['java', 'Eclipse Adoptium', 'Amazon Corretto'].map(s => `c:/Program Files/${s}/*/release`)
		: [
			// Linux
			'/usr/lib/jvm/*/release',
			// macos
			'/Library/Java/JavaVirtualMachines/*/Contents/Home/release',
			path.join(os.homedir(), '.sdkman/candidates/java/*/release'),
		]
	;
	for (const javaHome of [process.env.JAVA_HOME, process.env.JDK_HOME]) {
		if (javaHome) {
			// fast-glob cannot use Windows '\' delimiter, so replace
			scanDirs.push(path.join(javaHome, 'release').replace(/\\/g,'/'));
		}
	}
	interface JdkInfo extends jdkbundle.JavaRuntime {
		fullVersion: string;
	}
	const latestVersionMap = new Map<number, JdkInfo>();
	
	// Scan JDK
	for await(const releaseBuf of fg.stream(scanDirs, {followSymbolicLinks:false})) {

		const release = releaseBuf.toString();
		if (release.includes('/current/')) { // macos SDKMAN link
			continue;
		}
		const javac = path.join(release, '../bin', jdkbundle.os.isWindows() ? 'javac.exe' : 'javac');
		if (!fs.existsSync(javac)) {
			continue;
		}
		const lines = fs.readFileSync(release).toString().split(/\r?\n/);
		const versionLine = lines.find(s => s.startsWith('JAVA_VERSION='));
		if (!versionLine) {
			continue;
		}
		const fullVersion = versionLine.replace(/^.+="([^"]+)"$/, '$1');
		const majorVersion:number = Number(fullVersion.replace(/^(1\.[5-8]|[0-9]+).*$/, '$1').replace(/^1\./, ''));
		jdkbundle.log(`Detected. ${majorVersion} (${fullVersion}) ${release}`);

		const runtimeName = jdkbundle.runtime.nameOf(majorVersion);
		if (!redhatRuntimeNames.includes(runtimeName)) {
			continue;
		}
		const jdkInfo = latestVersionMap.get(majorVersion);
		if (!jdkInfo || jdkbundle.runtime.isSmallLeft(jdkInfo.fullVersion, fullVersion)) {
			latestVersionMap.set(majorVersion, {
				fullVersion: fullVersion,
				name: runtimeName,
				path: path.dirname(path.normalize(release.toString()))
			});
		}
	}

	// Set Runtimes Configuration
	for (const scanedJdk of latestVersionMap.values()) {
		const matchedRuntime = runtimes.find(r => r.name === scanedJdk.name);
		if (matchedRuntime) {
			if (!jdkbundle.runtime.isVSCodeStorage(matchedRuntime.path, context)) {
				matchedRuntime.path = scanedJdk.path;
			}
		} else {
			runtimes.push({name: scanedJdk.name, path: scanedJdk.path});
		}
	}
}

async function downloadJdk(
	context:vscode.ExtensionContext, 
	runtimes:jdkbundle.JavaRuntime[],
	majorVersion:number, 
	progress:vscode.Progress<any>): Promise<void> {

	const runtimeName = jdkbundle.runtime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && !jdkbundle.runtime.isVSCodeStorage(matchedRuntime.path, context)) {
		return;
	}

	// Get Download URL
	const URL_PREFIX = 'https://github.com/adoptium';
	const response = await axios.get(`${URL_PREFIX}/temurin${majorVersion}-binaries/releases/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const userDir = context.globalStorageUri.fsPath;
	const jdkDir = path.join(userDir, String(majorVersion));
	const javaHome = jdkbundle.os.isMac() ? path.join(jdkDir, 'Home') : jdkDir;

	// Check Version File
	const versionFile = path.join(jdkDir, 'version.txt');
	let fullVersionOld = null;
	if (fs.existsSync(versionFile)) {
		fullVersionOld = fs.readFileSync(versionFile).toString();
		if (fullVersion === fullVersionOld) {
			jdkbundle.log('No updates.', fullVersion);
			if (!matchedRuntime) {
				// Missing configuration entry but exists JDK directory
				runtimes.push({name: runtimeName, path: javaHome});
			}
			return;
		}
	}
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/temurin${majorVersion}-binaries/releases/download/${p1}/`;
	const arch = jdkbundle.os.nameOf(majorVersion);
	const fileExt = jdkbundle.os.isWindows() ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${fileExt}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	jdkbundle.log('Downloading... ', downloadUrl);
	progress.report({ message: `JDK Bundle: ${l10n.t('Downloading')} ${fullVersion}` });
	if (!fs.existsSync(userDir)) {
		fs.mkdirSync(userDir);
	}
	const downloadedFile = jdkDir + '.tmp';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);
	jdkbundle.log('Saved. ', downloadedFile);

	// Decompress JDK
	progress.report({ message: `JDK Bundle: ${l10n.t('Installing')} ${fullVersion}` });
	jdkbundle.rmSync(jdkDir, { recursive: true });
	try {
		await decompress(downloadedFile, userDir, {
			map: file => {
				file.path = file.path.replace(/^[^\/]+/, String(majorVersion));
				if (jdkbundle.os.isMac()) {
					file.path = file.path.replace(/^([0-9]+\/)Contents\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		jdkbundle.log('Failed decompress: ' + e);
	}
	jdkbundle.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = javaHome;
	} else {
		runtimes.push({name: runtimeName, path: javaHome});
	}
	const message = fullVersionOld 
		? `${l10n.t('UPDATE SUCCESSFUL')} ${runtimeName}: ${fullVersionOld} -> ${fullVersion}`
		: `${l10n.t('INSTALL SUCCESSFUL')} ${runtimeName}: ${fullVersion}`;
	progress.report({ message: `JDK Bundle: ${message}` });
}
