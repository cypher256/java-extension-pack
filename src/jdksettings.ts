/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import { compare } from 'compare-versions';
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import * as downloadgradle from './download/gradle';
import * as downloadmaven from './download/maven';
import * as jdkcontext from './jdkcontext';
import * as jdkscan from './jdkscan';
const { log, OS } = jdkcontext;

/**
 * An interface for the VSCode Java configuration runtime.
 */
export interface IConfigRuntime {
	readonly name: string;
	path: string;
	default?: boolean;
}

/**
 * The namespace for the Java configuration runtime.
 */
export namespace runtime {

	export const CONFIG_KEY = 'java.configuration.runtimes';

	export function getConfigRuntimes(): IConfigRuntime[] {
		const config = vscode.workspace.getConfiguration();
		return config.get(CONFIG_KEY, []);
	}

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

	export function getJdtNames(): string[] {
		// Do not add redhat to extensionDependencies,
		// because JDK Auto will not start when redhat activation error occurs.
		const redhatJava = vscode.extensions.getExtension('redhat.java');
		const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
		const jdtRuntimeNames:string[] = redhatProp?.[CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
		if (jdtRuntimeNames.length === 0) {
			log.warn('Failed getExtension RedHat', redhatJava);
		}
		return jdtRuntimeNames;
	}

	export function getAvailableVersions(): number[] {
		return getJdtNames().map(versionOf);
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
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param latestLtsVersion The latest LTS version.
 */
export async function updateRuntimes(
	runtimes:IConfigRuntime[],
	runtimesOld:IConfigRuntime[],
	latestLtsVersion:number) {

	const config = vscode.workspace.getConfiguration();
	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (config.get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) {
		removeEntry(CONFIG_KEY_DEPRECATED_JAVA_HOME);
	}

	// VSCode LS Java Home (Fix if unsupported old version)
	const latestLtsRuntime = runtimes.find(r => r.name === runtime.nameOf(latestLtsVersion));
	if (latestLtsRuntime) {
		for (const CONFIG_KEY_LS_JAVA_HOME of [
			// Reload dialog by redhat.java extension
			'java.jdt.ls.java.home',
			// No dialog (Note: extension.ts addConfigChangeEvent)
			'spring-boot.ls.java.home',
			'rsp-ui.rsp.java.home',
		]) {
			const originPath = config.get<string>(CONFIG_KEY_LS_JAVA_HOME);
			const latestLtsPath = latestLtsRuntime.path;
			let javaHome = null;
			if (originPath) {
				const fixedPath = await jdkscan.fixPath(originPath);
				if (fixedPath) {
					// RedHat LS minimum version check: REQUIRED_JDK_VERSION
					// https://github.com/redhat-developer/vscode-java/blob/master/src/requirements.ts
					const jdk = await jdkscan.findByPath(fixedPath);
					if (!jdk || jdk.majorVersion < latestLtsVersion) {
						javaHome = latestLtsPath; // Fix unsupported older version
					} else if (fixedPath !== originPath) {
						javaHome = fixedPath; // Fix invalid
					} else {
						// Keep new version
					}
				} else {
					javaHome = latestLtsPath; // Can't fix
				}
			} else {
				javaHome = latestLtsPath; // if unset
			}
			if (javaHome) {
				updateEntry(CONFIG_KEY_LS_JAVA_HOME, javaHome);

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
		function _updateMavenJavaHome(newPath: string) {
			mavenJavaHome.value = newPath;
			updateEntry(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
		if (mavenJavaHome) {
			const fixedPath = await jdkscan.fixPath(mavenJavaHome.value, defaultRuntime.path);
			if (fixedPath && fixedPath !== mavenJavaHome.value) {
				_updateMavenJavaHome(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			mavenJavaHome = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHome);
			_updateMavenJavaHome(defaultRuntime.path);
		}
	}

	// Terminal Default Environment Variables (Keep if set)
	let mavenBinDir:string | undefined = undefined;
	const mvnExePath = config.get<string>(downloadmaven.CONFIG_KEY_MAVEN_EXE_PATH) || await jdkcontext.whichPath('mvn');
	if (mvnExePath) {
		mavenBinDir = path.join(mvnExePath, '..');
	}
	let gradleBinDir:string | undefined = undefined;
	const gradleHome = config.get<string>(downloadgradle.CONFIG_KEY_GRADLE_HOME);
	if (gradleHome) {
		gradleBinDir = path.join(gradleHome, 'bin');
	} else {
		const gradleSystemExePath = await jdkcontext.whichPath('gradle');
		if (gradleSystemExePath) {
			gradleBinDir = path.join(gradleSystemExePath, '..');
		}
	}
	function _setTerminalEnv(javaHome: string, env: any) {
		const pathArray = [];
		pathArray.push(path.join(javaHome, 'bin'));
		pathArray.push(mavenBinDir);
		pathArray.push(gradleBinDir);
		pathArray.push('${env:PATH}');
		env.PATH = pathArray.filter(i => i).join(OS.isWindows ? ';' : ':');
		env.JAVA_HOME = javaHome;
	}
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	if (defaultRuntime && OS.isWindows) { // Exclude macOS (Support npm scripts)
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalEnv:any = _.cloneDeep(config.get(CONFIG_KEY_TERMINAL_ENV, {})); // Proxy to POJO for isEqual
		function _updateTerminalDefault(newPath: string) {
			const terminalEnvOld = _.cloneDeep(terminalEnv);
			_setTerminalEnv(newPath, terminalEnv);
			if (!_.isEqual(terminalEnv, terminalEnvOld) ) {
				updateEntry(CONFIG_KEY_TERMINAL_ENV, terminalEnv);
			}
		}
		if (terminalEnv.JAVA_HOME) {
			const fixedPath = await jdkscan.fixPath(terminalEnv.JAVA_HOME, defaultRuntime.path);
			if (fixedPath) {
				_updateTerminalDefault(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			_updateTerminalDefault(defaultRuntime.path);
		}
	}

	// Terminal Default Profile (Keep if set)
	if (OS.isWindows) {
		setIfNull('terminal.integrated.defaultProfile.windows', 'Command Prompt');
	}

	// Terminal Profiles Dropdown
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesOld:any = _.cloneDeep(config.get(CONFIG_KEY_TERMINAL_PROFILES)); // Proxy to POJO for isEqual
	const profilesNew:any = Object.fromEntries(Object.entries(profilesOld)
		.filter(([key, profile]) => !runtime.versionOf(key))); // Copy unmanaged profile

	for (const runtime of runtimes) {
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		profile.env ??= {};
		if (OS.isWindows) {
			profile.path ??= 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
		} else if (OS.isMac) {
			profile.path ??= 'zsh';
			profile.args ??= ['-l']; // Disable .zshrc JAVA_HOME in _setTerminalEnv ZDOTDIR
			profile.env.ZDOTDIR ??= `~/.zsh_jdkauto`; // Disable .zshrc JAVA_HOME
		} else {
			profile.path ??= 'bash';
			profile.args ??= ["--rcfile", "~/.bashrc_jdkauto"]; // Disable .bashrc JAVA_HOME (also WSL)
		}
		_setTerminalEnv(runtime.path, profile.env);
		profilesNew[runtime.name] = profile;
	}
	if (!_.isEqual(profilesNew, profilesOld) ) {
		updateEntry(CONFIG_KEY_TERMINAL_PROFILES, profilesNew);
	}
}

/**
 * Updates a VSCode settings entry.
 */
export async function updateEntry(section:string, value:any) {
	const config = vscode.workspace.getConfiguration();
	log.info('Updated settings:', section, _.isObject(value) ? '' : value);
	return await config.update(section, value, vscode.ConfigurationTarget.Global); // User Settings
}

/**
 * Removes a VSCode settings entry.
 */
export async function removeEntry(section:string) {
	return await updateEntry(section, undefined);
}

function setIfNull(section:string, value:any, extensionName?:string) {
	if (extensionName && !vscode.extensions.getExtension(extensionName)) {
		return;
	}
	const config = vscode.workspace.getConfiguration();
	if (config.inspect(section)?.globalValue === undefined) {
		updateEntry(section, value);
	}
}

/**
 * Sets default values for VSCode settings.
 */
export function setDefault() {
	/* eslint-disable @typescript-eslint/naming-convention */
	setIfNull('java.debug.settings.hotCodeReplace', 'auto');
	setIfNull('java.sources.organizeImports.staticStarThreshold', 1);
	// VSCode General
	setIfNull('editor.codeActionsOnSave', {
		"source.organizeImports": true
	});
	setIfNull('editor.minimap.enabled', false);
	setIfNull('editor.rulers', [
		{
			"column": 80,
			"color": "#00FF0010"
		},
		{
			"column": 100,
			"color": "#BDB76B15"
		},
		{
			"column": 120,
			"color": "#FA807219"
		},
	]);
	setIfNull('editor.unicodeHighlight.includeComments', true);
	setIfNull('workbench.colorCustomizations', {
		"[Default Dark+][Visual Studio Dark]": {
			"tab.activeBorder": "#0F0",
		},
		"[Default Dark Modern]": {
            "tab.activeBorderTop": "#00FF00",
            "tab.unfocusedActiveBorderTop" : "#00FF0088",
            "textCodeBlock.background": "#00000055",
        },
		"editor.wordHighlightStrongBorder": "#FF6347",
		"editor.wordHighlightBorder": "#FFD700",
		"editor.selectionHighlightBorder": "#A9A9A9",
	});
	setIfNull('workbench.tree.indent', 20);
	if (OS.isWindows) {
		setIfNull('files.eol', '\n');
		setIfNull('[bat]', {'files.eol': '\r\n'});
	}
	// VSCode Terminal
	setIfNull('terminal.integrated.enablePersistentSessions', false);
	// Third party extensions
	setIfNull('cSpell.diagnosticLevel', 'Hint', 'streetsidesoftware.code-spell-checker');
	setIfNull('trailing-spaces.includeEmptyLines', false, 'shardulm94.trailing-spaces');
}
