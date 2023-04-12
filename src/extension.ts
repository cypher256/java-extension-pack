/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as jdkutils from 'jdk-utils';
import * as _ from "lodash";
import * as decompress from 'decompress';
import axios from 'axios';
import { promisify } from 'util';
import { jdkbundle } from './jdkbundle';

const AVAILABLE_LTS_VERSIONS = [8, 11, 17];
const JDT_LTS_VERSION = AVAILABLE_LTS_VERSIONS[AVAILABLE_LTS_VERSIONS.length - 1];
const INIT_DEFAULT_LTS_VERSION = JDT_LTS_VERSION;
const CONFIG_KEY_JAVA_RUNTIMES = 'java.configuration.runtimes';

/**
 * Activates the extension.
 * @param context The extension context.
 */
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

		// Scan JDK
		try {
			const runtimesOld = _.cloneDeep(runtimes);
			await scanJdk(context, runtimes, downloadVersions);
			updateConfiguration(runtimes, runtimesOld);

		} catch (e:any) {
			let message = `JDK scan failed. ${e.message ? e.message : e}`;
			vscode.window.showErrorMessage(message);
			jdkbundle.log(e);
		}

		// Download JDK
		try {
			const runtimesOld = _.cloneDeep(runtimes);
			const promiseArray: Promise<void>[] = [];
			for (const majorVersion of downloadVersions) {
				promiseArray.push(
					downloadJdk(context, runtimes, majorVersion, progress)
				);
			}
			await Promise.all(promiseArray);
			updateConfiguration(runtimes, runtimesOld);

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

/**
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 */
function updateConfiguration(
	runtimes:jdkbundle.JavaRuntime[], 
	runtimesOld:jdkbundle.JavaRuntime[]) {

	const config = vscode.workspace.getConfiguration();
	const updateConfig = (section:string, value:any) => {
		config.update(section, value, vscode.ConfigurationTarget.Global);
		jdkbundle.log(`Updated ${section}`);
	};

	// VSCode LS Java Home (Always overwrite)
	const jdtRuntimePath = runtimes.find(r => r.name === jdkbundle.runtime.nameOf(JDT_LTS_VERSION))?.path;
	if (jdtRuntimePath) {
		for (const CONFIG_KEY_LS_JAVA_HOME of ['java.jdt.ls.java.home', 'spring-boot.ls.java.home']) {
			if (jdtRuntimePath !== config.get(CONFIG_KEY_LS_JAVA_HOME)) {
				// JDT LS: Java Extension prompts to reload dialog
				updateConfig(CONFIG_KEY_LS_JAVA_HOME, jdtRuntimePath);
			}
		}
	}

	// Project Runtimes Default (Keep if set)
	const initDefaultRuntime = runtimes.find(r => r.name === jdkbundle.runtime.nameOf(INIT_DEFAULT_LTS_VERSION));
	const isNoneDefault = runtimes.find(r => r.default) ? false : true;
	if (isNoneDefault || !_.isEqual(runtimes, runtimesOld)) {
		if (isNoneDefault && initDefaultRuntime) {
			initDefaultRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		updateConfig(CONFIG_KEY_JAVA_RUNTIMES, runtimes);
	}

	// Project Maven Java Home (Keep if exsits)
	if (initDefaultRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = config.get(CONFIG_KEY_MAVEN_CUSTOM_ENV) || [];
		let mavenJavaHome = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
		const updateMavenJavaHome = () => {
			mavenJavaHome.value = initDefaultRuntime.path;
			updateConfig(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		};
		if (mavenJavaHome) {
			if (!fs.existsSync(mavenJavaHome.value)) {
				updateMavenJavaHome();
			}
		} else if (!fs.existsSync(process.env.JAVA_HOME || '')) {
			mavenJavaHome = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHome);
			updateMavenJavaHome();
		}
	}
	const CONFIG_KEY_JAVA_DOT_HOME = 'java.home';
	if (config.get(CONFIG_KEY_JAVA_DOT_HOME)) {
		updateConfig(CONFIG_KEY_JAVA_DOT_HOME, undefined);
	}
}

/**
 * Scan installed JDK on the system and updates the given list of Java runtimes.
 * @param context The VS Code extension context.
 * @param runtimes The list of Java runtimes to update.
 * @param downloadVersions The set of versions to download.
 * @returns Promise that resolves when the JDK scan and runtime update is complete.
 */
async function scanJdk(
	context:vscode.ExtensionContext, 
	runtimes:jdkbundle.JavaRuntime[],
	downloadVersions:Set<number>) {

	// Remove configuration where directory does not exist
	for (let i = runtimes.length - 1; i >= 0; i--) {
		if (!await jdkbundle.runtime.getJavacRuntime(runtimes[i].path)) { 
			runtimes.splice(i, 1);
		}
	}

	// Get Supported Runtime Names from Red Hat Extension
	const redhatJava = vscode.extensions.getExtension('redhat.java');
	const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
	const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY_JAVA_RUNTIMES]?.items?.properties?.name?.enum || [];
	if (redhatRuntimeNames.length === 0) {
		redhatRuntimeNames.push(...[...downloadVersions].map(s => jdkbundle.runtime.nameOf(s)));
		jdkbundle.log('Failed getExtension RedHat', redhatJava);
	} else {
		const latestVersion = jdkbundle.runtime.versionOf(redhatRuntimeNames[redhatRuntimeNames.length - 1]);
		if (latestVersion) {
			jdkbundle.log('RedHat supported latest version:', latestVersion);
			downloadVersions.add(latestVersion);
		}
	}

	// Scan User Installed JDK
	const scannedJavas = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });
	interface JdkInfo extends jdkbundle.JavaRuntime {
		fullVersion: string;
	}
	const latestMajorMap = new Map<number, JdkInfo>();

	for (const scannedJava of scannedJavas) {
		const scanedVersion = scannedJava.version;
		jdkbundle.log(`Detected. ${scanedVersion?.major} (${scanedVersion?.java_version}) ${scannedJava.homedir}`);
		if (!scanedVersion || !scannedJava.hasJavac) {
			continue;
		}
		const runtimeName = jdkbundle.runtime.nameOf(scanedVersion.major);
		if (!redhatRuntimeNames.includes(runtimeName)) {
			continue;
		}
		const latestJdk = latestMajorMap.get(scanedVersion.major);
		if (!latestJdk || jdkbundle.runtime.isNewLeft(scanedVersion.java_version, latestJdk.fullVersion)) {
			latestMajorMap.set(scanedVersion.major, {
				fullVersion: scanedVersion.java_version,
				name: runtimeName,
				path: scannedJava.homedir,
			});
		}
	}

	// Scan Auto-Downloaded JDK (Old Version Support)
	for (const redhatRuntimeName of redhatRuntimeNames) {
		const major = jdkbundle.runtime.versionOf(redhatRuntimeName);
		if (latestMajorMap.has(major)) {
			continue; // Prioritize User Installed JDK
		}
		const downloadJdkDir = path.join(context.globalStorageUri.fsPath, String(major));
		const javaHome = jdkbundle.runtime.javaHome(downloadJdkDir);
		const downloadedJava = await jdkbundle.runtime.getJavacRuntime(javaHome);
		if (downloadedJava) {
			latestMajorMap.set(major, {
				fullVersion: '',
				name: redhatRuntimeName,
				path: javaHome,
			});
		}
	}

	// Set Runtimes Configuration
	for (const scannedJdkInfo of latestMajorMap.values()) {
		const matchedRuntime = runtimes.find(r => r.name === scannedJdkInfo.name);
		if (matchedRuntime) {
			if (jdkbundle.runtime.isUserInstalled(matchedRuntime.path, context)) {
				matchedRuntime.path = scannedJdkInfo.path;
			}
		} else {
			runtimes.push({name: scannedJdkInfo.name, path: scannedJdkInfo.path});
		}
	}
}

/**
 * Downloads and installs a specific version of the JDK if it is not already installed.
 * @param context The extension context.
 * @param runtimes An array of installed Java runtimes.
 * @param majorVersion The major version of the JDK to download.
 * @param progress A progress object used to report the download and installation progress.
 * @returns A promise that resolves when the JDK is downloaded and installed.
 */
async function downloadJdk(
	context:vscode.ExtensionContext, 
	runtimes:jdkbundle.JavaRuntime[],
	majorVersion:number, 
	progress:vscode.Progress<any>): Promise<void> {

	const runtimeName = jdkbundle.runtime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && jdkbundle.runtime.isUserInstalled(matchedRuntime.path, context)) {
		return; // Don't download if user installation
	}

	// Get Download URL
	const URL_PREFIX = 'https://github.com/adoptium';
	const response = await axios.get(`${URL_PREFIX}/temurin${majorVersion}-binaries/releases/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const globalStorageDir = context.globalStorageUri.fsPath;
	const downloadJdkDir = path.join(globalStorageDir, String(majorVersion));
	const javaHome = jdkbundle.runtime.javaHome(downloadJdkDir);

	// Check Version File
	const versionFile = path.join(downloadJdkDir, 'version.txt');
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
	if (!fs.existsSync(globalStorageDir)) {
		fs.mkdirSync(globalStorageDir);
	}
	const downloadedFile = downloadJdkDir + '.tmp';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);
	jdkbundle.log('Saved. ', downloadedFile);

	// Decompress JDK
	progress.report({ message: `JDK Bundle: ${l10n.t('Installing')} ${fullVersion}` });
	jdkbundle.rmSync(downloadJdkDir, { recursive: true });
	try {
		await decompress(downloadedFile, globalStorageDir, {
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
	const installedJava = await jdkbundle.runtime.getJavacRuntime(javaHome);
	if (!installedJava) {
		jdkbundle.log('Invalid jdk directory.', javaHome);
		return;
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
		? `${l10n.t('UPDATE SUCCESS')} ${runtimeName}: ${fullVersionOld} -> ${fullVersion}`
		: `${l10n.t('INSTALL SUCCESS')} ${runtimeName}: ${fullVersion}`;
	vscode.window.setStatusBarMessage(`JDK Bundle: ${message}`, 10_000);
}
