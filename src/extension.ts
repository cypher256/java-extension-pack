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
import { JdkBundle } from './jdkbundle';

const TARGET_JAVA_VERSIONS = [8, 11, 17];
const DEFAULT_JAVA_VERSION = 17;
const JDT_JAVA_VERSION = DEFAULT_JAVA_VERSION;
const CONFIG_KEY_JAVA_RUNTIMES = 'java.configuration.runtimes';

export async function activate(context:vscode.ExtensionContext) {

	JdkBundle.log('activate START', context.globalStorageUri.fsPath);
	const osArch = new JdkBundle.OsArch();
	if (!osArch.isTarget()) {
		vscode.window.showErrorMessage('Unable to download JDK due to unsupported OS or architecture.');
		return;
	}

	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		const config = vscode.workspace.getConfiguration();
		const runtimes:JdkBundle.JavaRuntime[] = config.get(CONFIG_KEY_JAVA_RUNTIMES) || [];
		const runtimesOld = _.cloneDeep(runtimes);

		try {
			await scanJdk(context, osArch, runtimes);
			updateConfiguration(config, runtimes, runtimesOld);

		} catch (e:any) {
			let message = `JDK scan failed. ${e.message ? e.message : e}`;
			vscode.window.showErrorMessage(message);
			JdkBundle.log(e);
		}

		try {
			const promiseArray: Promise<void>[] = [];
			for (const majorVersion of TARGET_JAVA_VERSIONS) {
				promiseArray.push(
					downloadJdk(
						context, 
						progress, 
						majorVersion, 
						osArch, 
						runtimes)
				);
			}
			await Promise.all(promiseArray);
			updateConfiguration(config, runtimes, runtimesOld);

		} catch (e:any) {
			let message = 'JDK configuration failed.';
			if (e.request?.path) {message += ' ' + e.request.path;}
			message += ` ${e.message ? e.message : e}`;
			vscode.window.showErrorMessage(message);
			JdkBundle.log(e);
		}
		JdkBundle.log('activate END');
	});
}

function updateConfiguration(
	config:vscode.WorkspaceConfiguration, 
	runtimes:JdkBundle.JavaRuntime[], 
	runtimesOld:JdkBundle.JavaRuntime[]) {

	if (!_.isEqual(runtimes, runtimesOld) || !runtimes.find(r => r.default)) {
		const defaultRuntime = runtimes.find(r => r.name === JdkBundle.runtimeName(DEFAULT_JAVA_VERSION));
		if (defaultRuntime) {
			defaultRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		config.update(CONFIG_KEY_JAVA_RUNTIMES, runtimes, vscode.ConfigurationTarget.Global);
		JdkBundle.log(`Updated ${CONFIG_KEY_JAVA_RUNTIMES}`);
		vscode.window.setStatusBarMessage(`JDK Bundle: ${l10n.t('Updated')} ${CONFIG_KEY_JAVA_RUNTIMES}`, 10_000);
	}

	const jdtRuntimePath = runtimes.find(r => r.name === JdkBundle.runtimeName(JDT_JAVA_VERSION))?.path;
	if (jdtRuntimePath) {
		const CONFIG_KEY_JDT_JAVA_HOME = 'java.jdt.ls.java.home';
		const jdtJavaHome = config.get(CONFIG_KEY_JDT_JAVA_HOME);
		if (jdtJavaHome !== jdtRuntimePath) {
			// Java Extension prompts to reload dialog
			config.update(CONFIG_KEY_JDT_JAVA_HOME, jdtRuntimePath, vscode.ConfigurationTarget.Global);
			config.update('java.home', undefined, vscode.ConfigurationTarget.Global); // remove
			JdkBundle.log(`Updated ${CONFIG_KEY_JDT_JAVA_HOME}`);
			vscode.window.setStatusBarMessage(`JDK Bundle: ${l10n.t('Updated')} ${CONFIG_KEY_JDT_JAVA_HOME}`, 10_000);
		}
	}
}

async function scanJdk(
	context:vscode.ExtensionContext, 
	osArch:JdkBundle.OsArch, 
	runtimes:JdkBundle.JavaRuntime[]) {

	// Check Exists path
	for (let i = runtimes.length - 1; i >= 0; i--) {
		if (!fs.existsSync(runtimes[i].path)) { 
			runtimes.splice(i, 1);
		}
	}

	// Get Supported Runtime Names in Red Hat Extension
	const redhat = vscode.extensions.getExtension('redhat.java');
	const redhatProp = redhat?.packageJSON?.contributes?.configuration?.properties;
	const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY_JAVA_RUNTIMES]?.items?.properties?.name?.enum || [];
	if (redhatRuntimeNames.length === 0) {
		redhatRuntimeNames.push(...TARGET_JAVA_VERSIONS.map(s => JdkBundle.runtimeName(s)));
		JdkBundle.log('Failed getExtension redhat', redhat);
	}

	// Directories to Scan
	const scanDirs:string[] = osArch.isWindows()
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
			scanDirs.push(path.join(javaHome, 'release').replace(/\\/g,'/'));
		}
	}
	interface JdkInfo extends JdkBundle.JavaRuntime {
		fullVersion: string;
	}
	const latestVersionMap = new Map<number, JdkInfo>();
	
	for await(const release of fg.stream(scanDirs, {followSymbolicLinks:false})) {

		const javac = path.join(release.toString(), '../bin', osArch.isWindows() ? 'javac.exe' : 'javac');
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
		JdkBundle.log(`Detected. ${majorVersion} (${fullVersion}) ${release}`);

		const runtimeName = JdkBundle.runtimeName(majorVersion);
		if (!redhatRuntimeNames.includes(runtimeName)) {
			continue;
		}
		const jdkInfo = latestVersionMap.get(majorVersion);
		if (!jdkInfo || JdkBundle.isLowerLeft(jdkInfo.fullVersion, fullVersion)) {
			latestVersionMap.set(majorVersion, {
				fullVersion: fullVersion,
				name: runtimeName,
				path: path.dirname(path.normalize(release.toString()))
			});
		}
	}

	// Set Runtimes Configuration
	for (const jdkInfo of latestVersionMap.values()) {
		const matchedRuntime = runtimes.find(r => r.name === jdkInfo.name);
		if (matchedRuntime) {
			if (JdkBundle.isScanedJdk(matchedRuntime, context)) {
				matchedRuntime.path = jdkInfo.path;
			}
		} else {
			runtimes.push({name: jdkInfo.name, path: jdkInfo.path});
		}
	}
}

async function downloadJdk(
	context:vscode.ExtensionContext, 
	progress:vscode.Progress<any>,
	majorVersion:number, 
	osArch:JdkBundle.OsArch, 
	runtimes:JdkBundle.JavaRuntime[]): Promise<void> {

	const runtimeName = JdkBundle.runtimeName(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && JdkBundle.isScanedJdk(matchedRuntime, context)) {
		return;
	}

	// Get Download URL
	const URL_PREFIX = 'https://github.com/adoptium';
	const response = await axios.get(`${URL_PREFIX}/temurin${majorVersion}-binaries/releases/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const userDir = context.globalStorageUri.fsPath;
	const jdkDir = path.join(userDir, String(majorVersion));
	const javaHome = osArch.isMac() ? path.join(jdkDir, 'Home') : jdkDir;

	// Check Version File
	const versionFile = path.join(jdkDir, 'version.txt');
	let fullVersionOld = null;
	if (fs.existsSync(versionFile)) {
		fullVersionOld = fs.readFileSync(versionFile).toString();
		if (fullVersion === fullVersionOld) {
			JdkBundle.log('No updates.', fullVersion);
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
	const arch = osArch.getName(majorVersion);
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${arch.includes('windows') ? 'zip' : 'tar.gz'}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	JdkBundle.log('Downloading... ', downloadUrl);
	progress.report({ message: `JDK Bundle: ${l10n.t('Downloading')} ${fullVersion}` });
	if (!fs.existsSync(userDir)) {
		fs.mkdirSync(userDir);
	}
	const downloadedFile = jdkDir + '.tmp';
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);
	JdkBundle.log('Saved. ', downloadedFile);

	// Decompress JDK
	progress.report({ message: `JDK Bundle: ${l10n.t('Installing')} ${fullVersion}` });
	JdkBundle.rmSync(jdkDir, { recursive: true });
	try {
		await decompress(downloadedFile, userDir, {
			map: file => {
				file.path = file.path.replace(/^[^\/]+/, String(majorVersion));
				if (osArch.isMac()) {
					file.path = file.path.replace(/^([0-9]+\/)Contents\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		JdkBundle.log('Failed decompress: ' + e);
	}
	JdkBundle.rmSync(downloadedFile);
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
