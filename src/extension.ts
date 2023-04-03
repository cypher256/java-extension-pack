/**
 * Java Extension Pack JDK Bundle
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as decompress from 'decompress';
import axios from 'axios';
import { Pleiades } from './pleiades';

const TARGET_JAVA_VERSIONS = [8, 11, 17];
const DEFAULT_JAVA_VERSION = 17;
const JDT_JAVA_VERSION = DEFAULT_JAVA_VERSION;

export async function activate(context:vscode.ExtensionContext) {
	Pleiades.log('Called activate START', context.globalStorageUri.fsPath);

	const osArch = new Pleiades.OsArch();
	if (!osArch.isTarget()) {
		vscode.window.showErrorMessage('Unable to download JDK due to unsupported OS or architecture.');
		return;
	}

	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		try {
			const promiseArray: Promise<Boolean>[] = [];
			const config = vscode.workspace.getConfiguration();
			const CONFIG_KEY_JAVA_RUNTIMES = 'java.configuration.runtimes';
			const runtimes:Pleiades.JavaRuntime[] = config.get(CONFIG_KEY_JAVA_RUNTIMES) || [];
	
			for (const javaVersion of TARGET_JAVA_VERSIONS) {
				promiseArray.push(
					downloadJdk(
						progress, 
						context, 
						javaVersion, 
						osArch.getString(javaVersion), 
						runtimes)
				);
			}
	
			const updates = await Promise.all(promiseArray);
			if (updates.includes(true) || !runtimes.find(r => r.default)) {
				const defaultRuntime = runtimes.find(r => r.name === 'JavaSE-' + DEFAULT_JAVA_VERSION);
				if (defaultRuntime) {
					defaultRuntime.default = true;
				}
				runtimes.sort((a, b) => a.name.localeCompare(b.name));
				config.update(CONFIG_KEY_JAVA_RUNTIMES, runtimes, vscode.ConfigurationTarget.Global);
				Pleiades.log(`Updated ${CONFIG_KEY_JAVA_RUNTIMES}`);
				vscode.window.setStatusBarMessage(`JDK Bundle: Updated ${CONFIG_KEY_JAVA_RUNTIMES}`, 10_000);
			}

			const jdtRuntimePath = runtimes.find(r => r.name === 'JavaSE-' + JDT_JAVA_VERSION)?.path;
			if (jdtRuntimePath) {
				const CONFIG_KEY_JDT_JAVA_HOME = 'java.jdt.ls.java.home';
				const jdtJavaHome = config.get(CONFIG_KEY_JDT_JAVA_HOME);
				if (jdtJavaHome !== jdtRuntimePath) {
					// Java Extension prompts to reload dialog
					config.update(CONFIG_KEY_JDT_JAVA_HOME, jdtRuntimePath, vscode.ConfigurationTarget.Global);
					config.update('java.home', undefined, true);
					Pleiades.log(`Updated ${CONFIG_KEY_JDT_JAVA_HOME}`);
					vscode.window.setStatusBarMessage(`JDK Bundle: Updated ${CONFIG_KEY_JDT_JAVA_HOME}`, 10_000);
				}
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
		Pleiades.log('Called activate END');
	});
}

async function downloadJdk(
	progress:vscode.Progress<any>,
	context:vscode.ExtensionContext, 
	javaVersion:number, 
	osArch:string, 
	runtimes:Pleiades.JavaRuntime[]): Promise<Boolean> {

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
			Pleiades.log('No updates.', fullVersion);
			return false;
		}
	}
	const p1 = fullVersion.replace('+', '%2B');
	const p2 = fullVersion.replace('+', '_').replace(/(jdk|-)/g, '');
	const downloadUrlPrefix = `${URL_PREFIX}/temurin${javaVersion}-binaries/releases/download/${p1}/`;
	const fileName = `OpenJDK${javaVersion}U-jdk_${osArch}_${p2}.${osArch.includes('windows') ? 'zip' : 'tar.gz'}`;
	const downloadUrl = downloadUrlPrefix + fileName;
	
	// Download JDK
	Pleiades.log('Downloading... ', downloadUrl);
	progress.report({ message: `JDK Bundle: Downloading ${fullVersion}` });
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
	Pleiades.log('Saved. ', downloadedFile);

	// Decompress JDK
	progress.report({ message: `JDK Bundle: Installing ${fullVersion}` });
	Pleiades.rmSync(jdkDir, { recursive: true });
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
		Pleiades.log('Failed decompress: ' + e);
	}
	Pleiades.rmSync(downloadedFile);
	fs.writeFileSync(versionFile, fullVersion);

	// Set Configuration
	const runtimeVersion = 'JavaSE-' + (javaVersion === 8 ? 1.8 : javaVersion);
	let matchRuntime = runtimes.find(r => r.name === runtimeVersion);
	if (matchRuntime) {
		matchRuntime.path = javaHome;
	} else {
		matchRuntime = {name: runtimeVersion, path: javaHome};
		runtimes.push(matchRuntime);
	}
	const message = fullVersionOld 
		? `UPDATE SUCCESSFUL ${runtimeVersion}: ${fullVersionOld} -> ${fullVersion}`
		: `INSTALL SUCCESSFUL ${runtimeVersion}: ${fullVersion}`;
	progress.report({ message: `JDK Bundle: ${message}` });
	return true;
}
