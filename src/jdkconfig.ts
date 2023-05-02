/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from "lodash";
import { compare } from 'compare-versions';
import * as jdkscan from './jdkscan';
import * as jdkcontext from './jdkcontext';
const { log, OS } = jdkcontext;

/**
 * An interface for the VSCode Java configuration runtime.
 */
export interface IConfigRuntime {
	name: string;
	path: string;
	default?: boolean;
}

/**
 * The namespace for the Java configuration runtime.
 */
export namespace runtime {

	export const CONFIG_KEY = 'java.configuration.runtimes';

	export function versionOf(runtimeName:string): number {
		return Number(runtimeName.replace(/^J(ava|2)SE-(1\.|)/, '')); // NaN if invalid
	}

	export function nameOf(majorVersion:number): string {
		if (majorVersion <= 5) {
			return 'J2SE-1.' + majorVersion;
		} else if (majorVersion <= 8) {
			return 'JavaSE-1.' + majorVersion;
		}
		return 'JavaSE-' + majorVersion;
	}

	export function getRedhatNames(): string[] {
		const redhatJava = vscode.extensions.getExtension('redhat.java'); // extensionDependencies
		const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
		const redhatRuntimeNames:string[] = redhatProp?.[CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
		if (redhatRuntimeNames.length === 0) {
			log.warn('Failed getExtension RedHat', redhatJava);
		}
		return redhatRuntimeNames;
	}

	export function getRedhatVersions(): number[] {
		return getRedhatNames().map(name => versionOf(name));
	}

	export function isUserInstalled(javaHome:string): boolean {
		const _javaHome = path.normalize(javaHome);
		const _globalStoragePath = path.normalize(jdkcontext.getGlobalStoragePath());
		return !_javaHome.startsWith(_globalStoragePath);
	}

	export function isNewLeft(leftVersion:string, rightVersion:string): boolean {
		try {
			const optimize = (s:string) => s.replace(/_/g, '.');
			return compare(optimize(leftVersion), optimize(rightVersion), '>');
		} catch (e) {
			log.warn('Failed compare-versions: ' + e);
			return false;
		}
	}
}

/**
 * Gets the Java runtime configurations for the VSCode Java extension.
 * @returns An array of Java runtime objects.
 */
export function getRuntimes(): IConfigRuntime[] {
	const config = vscode.workspace.getConfiguration();
	return config.get(runtime.CONFIG_KEY, []);
}

/**
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param latestLtsVersion The latest LTS version.
 */
export async function update(
	runtimes:IConfigRuntime[], 
	runtimesOld:IConfigRuntime[],
	latestLtsVersion:number) {

	const config = vscode.workspace.getConfiguration();
	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (config.get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) {
		updateEntry(CONFIG_KEY_DEPRECATED_JAVA_HOME, undefined);
	}

	// VSCode LS Java Home (Fix if unsupported old version)
	const latestLtsRuntime = runtimes.find(r => r.name === runtime.nameOf(latestLtsVersion));
	if (latestLtsRuntime) {
		for (const CONFIG_KEY_LS_JAVA_HOME of [
			// Reload dialog appears when changes
			'java.jdt.ls.java.home',
			// No dialog
			'spring-boot.ls.java.home',
			'rsp-ui.rsp.java.home',
		]) {
			const originPath = config.get<string>(CONFIG_KEY_LS_JAVA_HOME);
			const latestLtsPath = latestLtsRuntime.path;
			if (originPath) {
				const fixedPath = await jdkscan.fixPath(originPath);
				if (fixedPath) {
					// RedHat LS minimum version check: REQUIRED_JDK_VERSION
					// https://github.com/redhat-developer/vscode-java/blob/master/src/requirements.ts
					const jdk = await jdkscan.findByPath(fixedPath);
					if (!jdk || jdk.majorVersion < latestLtsVersion) {
						updateEntry(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Fix unsupported old version
					} else if (fixedPath !== originPath) {
						updateEntry(CONFIG_KEY_LS_JAVA_HOME, fixedPath); // Fix invalid
					} else {
						// Keep new version
					}
				} else {
					updateEntry(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Can't fix
				}
			} else {
				updateEntry(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // if unset
			}
		}
	}

	// Project Runtimes Default (Keep if set)
	const isNoneDefault = runtimes.find(r => r.default) ? false : true;
	if (isNoneDefault || !_.isEqual(runtimes, runtimesOld)) {
		if (isNoneDefault && latestLtsRuntime) {
			latestLtsRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		updateEntry(runtime.CONFIG_KEY, runtimes);
	}

	// Gradle Daemon Java Home (Fix if set), Note: If unset use java.jdt.ls.java.home
	const defaultRuntime = runtimes.find(r => r.default);
	if (defaultRuntime) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = config.get<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
		if (originPath) {
			const fixedPath = await jdkscan.fixPath(originPath, defaultRuntime.path);
			if (fixedPath && fixedPath !== originPath) {
				updateEntry(CONFIG_KEY_GRADLE_JAVA_HOME, fixedPath);
			}
		} else {
			updateEntry(CONFIG_KEY_GRADLE_JAVA_HOME, defaultRuntime.path);
		}
	}

	// Project Maven Java Home (Keep if set)
	const isValidEnvJavaHome = await jdkscan.isValidPath(process.env.JAVA_HOME);
	if (defaultRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = config.get(CONFIG_KEY_MAVEN_CUSTOM_ENV, []);
		let mavenJavaHome = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
		const updateMavenJavaHome = (newPath: string) => {
			mavenJavaHome.value = newPath;
			updateEntry(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		};
		if (mavenJavaHome) {
			const fixedPath = await jdkscan.fixPath(mavenJavaHome.value, defaultRuntime.path);
			if (fixedPath && fixedPath !== mavenJavaHome.value) {
				updateMavenJavaHome(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			mavenJavaHome = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHome);
			updateMavenJavaHome(defaultRuntime.path);
		}
	}

	// Terminal Default (Keep if set)
	const setTerminalEnv = (javaHome: string, env: any) => {
		env.JAVA_HOME = javaHome;
		env.PATH = javaHome + (OS.isWindows ? '\\bin;' : '/bin:') + '${env:PATH}';
		if (OS.isMac) {
			env.ZDOTDIR ??= jdkcontext.getGlobalStoragePath(); // Disable .zshrc JAVA_HOME
		}
	};
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	if (defaultRuntime) {
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalDefault:any = config.get(CONFIG_KEY_TERMINAL_ENV, {});
		const updateTerminalConfig = (newPath: string) => {
			setTerminalEnv(newPath, terminalDefault);
			updateEntry(CONFIG_KEY_TERMINAL_ENV, terminalDefault);
		};
		if (terminalDefault.JAVA_HOME) {
			const fixedPath = await jdkscan.fixPath(terminalDefault.JAVA_HOME, defaultRuntime.path);
			if (fixedPath && fixedPath !== terminalDefault.JAVA_HOME) {
				updateTerminalConfig(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			updateTerminalConfig(defaultRuntime.path);
		}
	}

	// Terminal Profiles
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesOld:any = _.cloneDeep(config.get(CONFIG_KEY_TERMINAL_PROFILES)); // Proxy to POJO
	const profilesNew:any = Object.fromEntries(Object.entries(profilesOld)
		.filter(([key, profile]) => !runtime.versionOf(key))); // Copy unmanaged profile

	for (const runtime of runtimes) {
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		if (OS.isWindows) {
			profile.path ??= 'powershell';
		} else {
			profile.path ??= OS.isMac ? 'zsh' : 'bash';
			profile.args ??= ['-l'];
		}
		profile.env ??= {};
		setTerminalEnv(runtime.path, profile.env);
		profilesNew[runtime.name] = profile;
	}
	if (!_.isEqual(profilesNew, profilesOld) ) {
		updateEntry(CONFIG_KEY_TERMINAL_PROFILES, profilesNew);
		// Don't set 'terminal.integrated.defaultProfile.*' because Terminal Default is set
	}
}

export function setDefault() {
	const config = vscode.workspace.getConfiguration();
	const CONFIG_KEY_TREE_INDENT = 'workbench.tree.indent';
	if (!config.inspect(CONFIG_KEY_TREE_INDENT)?.globalValue) {
		updateEntry(CONFIG_KEY_TREE_INDENT, 20);
	}
}

function updateEntry(section:string, value:any) {
	const config = vscode.workspace.getConfiguration();
	config.update(section, value, vscode.ConfigurationTarget.Global);
	log.info('Updated config:', section, _.isObject(value) ? '' : value);
}
