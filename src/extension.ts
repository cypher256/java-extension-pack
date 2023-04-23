/**
 * Java Extension Pack JDK Auto
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
import { jdkauto } from './jdkauto';

/**
 * Activates the extension.
 * @param context The extension context.
 */
export async function activate(context:vscode.ExtensionContext) {

	jdkauto.log('activate START', context.globalStorageUri.fsPath);
	jdkauto.log('JAVA_HOME', process.env.JAVA_HOME);
	const redhatVersions = jdkauto.runtime.getRedhatVersions();
	const downloadLtsVersions = redhatVersions.filter(v => [8, 11].includes(v) || (v >= 17 && (v - 17) % 4 === 0));
	const latestLtsVersion = _.last(downloadLtsVersions) ?? 0;
	jdkauto.log('RedHat versions ' + redhatVersions);
	jdkauto.log('Download LTS versions ' + downloadLtsVersions);
	const config = vscode.workspace.getConfiguration();
	const runtimes:jdkauto.ConfigRuntime[] = config.get(jdkauto.runtime.CONFIG_KEY) ?? [];

	// Scan JDK
	try {
		const runtimesOld = _.cloneDeep(runtimes);
		await scanJdk(context, runtimes);
		await updateConfiguration(context, runtimes, runtimesOld, latestLtsVersion);

	} catch (e:any) {
		let message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		jdkauto.log(message, e);
	}

	// Download JDK
	if (jdkauto.os.isDownloadTarget) {
		vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
			try {
				const runtimesOld = _.cloneDeep(runtimes);
				const promiseArray: Promise<void>[] = [];
				const downloadVersions = _.uniq([...downloadLtsVersions, _.last(redhatVersions) ?? 0]);
				for (const majorVersion of downloadVersions) {
					promiseArray.push(
						downloadJdk(context, runtimes, majorVersion, progress)
					);
				}
				await Promise.all(promiseArray);
				await updateConfiguration(context, runtimes, runtimesOld, latestLtsVersion);
	
			} catch (e:any) {
				let message = `JDK download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
				jdkauto.log(message, e); // Silent offline, 404 (building), etc.
			}
			jdkauto.log('activate END');
		});
	}
}

/**
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param context The VS Code extension context.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param latestLtsVersion The latest LTS version.
 * @returns A promise that resolves when the configuration has been updated.
 */
async function updateConfiguration(
	context:vscode.ExtensionContext, 
	runtimes:jdkauto.ConfigRuntime[], 
	runtimesOld:jdkauto.ConfigRuntime[],
	latestLtsVersion:number) {

	const config = vscode.workspace.getConfiguration();
	const updateConfig = (section:string, value:any) => {
		config.update(section, value, vscode.ConfigurationTarget.Global);
		jdkauto.log(`Updated config: ${section}`);
	};
	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (config.get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) {
		updateConfig(CONFIG_KEY_DEPRECATED_JAVA_HOME, undefined);
	}

	// Project Runtimes Default (Keep if set)
	const initDefaultRuntime = runtimes.find(r => r.name === jdkauto.runtime.nameOf(latestLtsVersion));
	const isNoneDefault = runtimes.find(r => r.default) ? false : true;
	if (isNoneDefault || !_.isEqual(runtimes, runtimesOld)) {
		if (isNoneDefault && initDefaultRuntime) {
			initDefaultRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		updateConfig(jdkauto.runtime.CONFIG_KEY, runtimes);
	}

	// VSCode LS Java Home (Fix if unsupported old version)
	const latestLtsPath = runtimes.find(r => r.name === jdkauto.runtime.nameOf(latestLtsVersion))?.path;
	if (latestLtsPath) {
		for (const CONFIG_KEY_LS_JAVA_HOME of ['java.jdt.ls.java.home', 'spring-boot.ls.java.home']) {
			const originPath = config.get(CONFIG_KEY_LS_JAVA_HOME) as string;
			// Dialog will appear if JDT LS changed
			if (originPath) {
				const fixedPath = await jdkauto.runtime.fixPath(originPath);
				if (fixedPath) {
					const rt = await jdkutils.getRuntime(fixedPath, { checkJavac: true, withVersion: true });
					if (!rt || !rt.hasJavac || !rt.version || rt.version.major < latestLtsVersion) {
						updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Unsupported Old Version
					} else if (fixedPath !== originPath) {
						updateConfig(CONFIG_KEY_LS_JAVA_HOME, fixedPath); // Fix
					} else {
						// Keep new version
					}
				} else {
					updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Invalid
				}
			} else {
				updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Unset
			}
		}
	}

	// Gradle Daemon Java Home (Fix if set), Note: If unset use java.jdt.ls.java.home
	if (initDefaultRuntime) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = config.get(CONFIG_KEY_GRADLE_JAVA_HOME) as string;
		if (originPath) {
			const fixedPath = await jdkauto.runtime.fixPath(originPath, initDefaultRuntime.path);
			if (fixedPath && fixedPath !== originPath) {
				updateConfig(CONFIG_KEY_GRADLE_JAVA_HOME, fixedPath);
			}
		} else {
			updateConfig(CONFIG_KEY_GRADLE_JAVA_HOME, initDefaultRuntime.path);
		}
	}

	// Project Maven Java Home (Keep if set)
	const isValidEnvJavaHome = await jdkauto.runtime.isValidJdk(process.env.JAVA_HOME);
	if (initDefaultRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = config.get(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? [];
		let mavenJavaHome = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
		const updateMavenJavaHome = (newPath: string) => {
			mavenJavaHome.value = newPath;
			updateConfig(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		};
		if (mavenJavaHome) {
			const fixedPath = await jdkauto.runtime.fixPath(mavenJavaHome.value, initDefaultRuntime.path);
			if (fixedPath && fixedPath !== mavenJavaHome.value) {
				updateMavenJavaHome(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			mavenJavaHome = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHome);
			updateMavenJavaHome(initDefaultRuntime.path);
		}
	}

	// Terminal Default (Keep if set)
	const setTerminalEnv = (javaHome: string, env: any) => {
		env.JAVA_HOME = javaHome;
		env.PATH = javaHome + (jdkauto.os.isWindows ? '\\bin;' : '/bin:') + '${env:PATH}';
	};
	const osConfigName = jdkauto.os.isWindows ? 'windows' : jdkauto.os.isMac ? 'osx' : 'linux';
	if (initDefaultRuntime) {
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalDefault:any = config.get(CONFIG_KEY_TERMINAL_ENV) ?? {};
		const updateTerminalConfig = (newPath: string) => {
			setTerminalEnv(newPath, terminalDefault);
			updateConfig(CONFIG_KEY_TERMINAL_ENV, terminalDefault);
		};
		if (terminalDefault.JAVA_HOME) {
			const fixedPath = await jdkauto.runtime.fixPath(terminalDefault.JAVA_HOME, initDefaultRuntime.path);
			if (fixedPath && fixedPath !== terminalDefault.JAVA_HOME) {
				updateTerminalConfig(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			updateTerminalConfig(initDefaultRuntime.path);
		}
	}

	// Terminal Profiles
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesOld:any = _.cloneDeep(config.get(CONFIG_KEY_TERMINAL_PROFILES)); // Proxy to POJO
	const profilesNew:any = Object.fromEntries(Object.entries(profilesOld)
		.filter(([key, profile]) => !jdkauto.runtime.versionOf(key)));

	for (const runtime of runtimes) {
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {};
		profile.overrideName = true;
		profile.env ??= {};
		if (jdkauto.os.isWindows) {
			profile.path ??= 'powershell';
		} else {
			profile.path ??= jdkauto.os.isMac ? 'zsh' : 'bash';
			profile.args ??= ['-l'];
		}
		if (jdkauto.os.isMac) {
			profile.env.ZDOTDIR ??= context.globalStorageUri.fsPath;
		}
		setTerminalEnv(runtime.path, profile.env);
		profilesNew[runtime.name] = profile;
	}
	if (!_.isEqual(profilesNew, profilesOld) ) {
		updateConfig(CONFIG_KEY_TERMINAL_PROFILES, profilesNew);
		// Don't set 'terminal.integrated.defaultProfile.*' because Terminal Default is set
	}
}

/**
 * Scan installed JDK on the system and updates the given list of Java runtimes.
 * @param context The VS Code extension context.
 * @param runtimes The list of Java runtimes to update.
 * @returns Promise that resolves when the JDK scan and runtime update is complete.
 */
async function scanJdk(
	context:vscode.ExtensionContext, 
	runtimes:jdkauto.ConfigRuntime[]) {

	// Fix JDK path
	for (let i = runtimes.length - 1; i >= 0; i--) { // Decrement for splice
		const originPath = runtimes[i].path;
		const fixedPath = await jdkauto.runtime.fixPath(originPath);
		if (!fixedPath) {
			jdkauto.log(`Remove ${originPath}`);
			runtimes.splice(i, 1);
		} else if (fixedPath !== originPath) {
			jdkauto.log(`Fix\n   ${originPath}\n-> ${fixedPath}`);
			runtimes[i].path = fixedPath;
		}
	}

	// Scan User Installed JDK
	interface JdkInfo extends jdkauto.ConfigRuntime {
		fullVersion: string;
	}
	const latestMajorMap = new Map<number, JdkInfo>();
	const redhatVersions = jdkauto.runtime.getRedhatVersions();
	const scannedJavas = await jdkutils.findRuntimes({ checkJavac: true, withVersion: true });

	for (const scannedJava of scannedJavas) {
		const version = scannedJava.version;
		const jreMessage = scannedJava.hasJavac ? '' : 'JRE ';
		jdkauto.log(`Detected ${jreMessage}${version?.major} (${version?.java_version}) ${scannedJava.homedir}`);
		if (!version || !scannedJava.hasJavac) {
			continue;
		}
		if (!redhatVersions.includes(version.major)) {
			continue;
		}
		const latestJdk = latestMajorMap.get(version.major);
		if (!latestJdk || jdkauto.runtime.isNewLeft(version.java_version, latestJdk.fullVersion)) {
			latestMajorMap.set(version.major, {
				fullVersion: version.java_version,
				name: jdkauto.runtime.nameOf(version.major),
				path: scannedJava.homedir,
			});
		}
	}

	// Scan Auto-Downloaded JDK (Old Java Version Support)
	for (const major of redhatVersions) {
		if (latestMajorMap.has(major)) {
			continue; // Prefer user-installed JDK
		}
		let downloadJdkDir = path.join(context.globalStorageUri.fsPath, String(major));
		if (await jdkauto.runtime.isValidJdk(downloadJdkDir)) {
			jdkauto.log(`Detected ${major} Auto-downloaded JDK`);
			latestMajorMap.set(major, {
				fullVersion: '',
				name: jdkauto.runtime.nameOf(major),
				path: downloadJdkDir,
			});
		}
	}

	// Set Runtimes Configuration
	for (const scannedJdkInfo of latestMajorMap.values()) {
		const matchedRuntime = runtimes.find(r => r.name === scannedJdkInfo.name);
		if (matchedRuntime) {
			// Update if original path is user-installed JDK path
			if (jdkauto.runtime.isUserInstalled(matchedRuntime.path, context)) {
				matchedRuntime.path = scannedJdkInfo.path;
			} // else Keep if the original path is downloaded JDK path
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
	runtimes:jdkauto.ConfigRuntime[],
	majorVersion:number, 
	progress:vscode.Progress<any>): Promise<void> {

	const runtimeName = jdkauto.runtime.nameOf(majorVersion);
	const matchedRuntime = runtimes.find(r => r.name === runtimeName);
	if (matchedRuntime && jdkauto.runtime.isUserInstalled(matchedRuntime.path, context)) {
		jdkauto.log(`No download ${majorVersion} (User installed)`);
		return;
	}

	// Get Download URL
	const URL_PREFIX = `https://github.com/adoptium/temurin${majorVersion}-binaries/releases`;
	const response = await axios.get(`${URL_PREFIX}/latest`);
	const redirectedUrl:string = response.request.res.responseUrl;
	const fullVersion = redirectedUrl.replace(/.+tag\//, '');
	const globalStorageDir = context.globalStorageUri.fsPath;
	const downloadJdkDir = path.join(globalStorageDir, String(majorVersion));

	// Check Version File
	const versionFile = path.join(downloadJdkDir, 'version.txt');
	const fullVersionOld = fs.existsSync(versionFile) ? fs.readFileSync(versionFile).toString() : null;
	if (fullVersion === fullVersionOld && await jdkauto.runtime.isValidJdk(downloadJdkDir)) {
		jdkauto.log(`No download ${majorVersion} (No updates)`);
		return;
	}
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/download/${p1}/`;
	const arch = jdkauto.os.archOf(majorVersion);
	const fileExt = jdkauto.os.isWindows ? 'zip' : 'tar.gz';
	const fileName = `OpenJDK${majorVersion}U-jdk_${arch}_${p2}.${fileExt}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	jdkauto.log('Downloading...', downloadUrl);
	progress.report({ message: `JDK Auto: ${l10n.t('Downloading')} ${fullVersion}` });
	if (!fs.existsSync(globalStorageDir)) {
		fs.mkdirSync(globalStorageDir);
	}
	const downloadedFile = downloadJdkDir + '_download_tmp.' + fileExt;
	const writer = fs.createWriteStream(downloadedFile);
	const res = await axios.get(downloadUrl, {responseType: 'stream'});
	res.data.pipe(writer);
	await promisify(stream.finished)(writer);

	// Decompress JDK
	jdkauto.log('Installing...', downloadedFile);
	progress.report({ message: `JDK Auto: ${l10n.t('Installing')} ${fullVersion}` });
	jdkauto.rmSync(downloadJdkDir);
	try {
		await decompress(downloadedFile, globalStorageDir, {
			map: file => {
				file.path = file.path.replace(/^[^\/]+/, String(majorVersion));
				if (jdkauto.os.isMac) {
					file.path = file.path.replace(/^([0-9]+\/)Contents\/Home\//, '$1');
				}
				return file;
			}
		});
	} catch (e) {
		jdkauto.log('Failed decompress: ' + e); // Validate below
	}
	if (!await jdkauto.runtime.isValidJdk(downloadJdkDir)) {
		jdkauto.log('Invalid jdk directory:', downloadJdkDir);
		_.remove(runtimes, r => r.name === runtimeName);
		return; // Silent
	}
	jdkauto.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Runtimes Configuration
	if (matchedRuntime) {
		matchedRuntime.path = downloadJdkDir;
	} else {
		runtimes.push({name: runtimeName, path: downloadJdkDir});
	}
	const message = fullVersionOld 
		? `${l10n.t('UPDATE SUCCESS')} ${runtimeName}: ${fullVersionOld} -> ${fullVersion}`
		: `${l10n.t('INSTALL SUCCESS')} ${runtimeName}: ${fullVersion}`;
	vscode.window.setStatusBarMessage(`JDK Auto: ${message}`, 15_000);
}
