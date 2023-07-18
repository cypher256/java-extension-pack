/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import * as autoContext from './autoContext';
import { OS, log } from './autoContext';
import * as downloadGradle from './download/gradle';
import * as downloadMaven from './download/maven';
import * as javaExtension from './javaExtension';
import * as jdkExplorer from './jdkExplorer';

/**
 * Return a value from user settings configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @return The value `section` denotes or `undefined`. null is a valid value.
 */
export function get<T>(section: string): T | undefined {
	return vscode.workspace.getConfiguration().get(section);
}

/**
 * Updates a VSCode user settings entry.
 * @return A promise that resolves when the configuration is updated.
 */
export async function update(section:string, value:any) {
	log.info('Update settings:', section, _.isObject(value) ? '' : value);
	const config = vscode.workspace.getConfiguration();
	return await config.update(section, value, vscode.ConfigurationTarget.Global);
}

/**
 * Removes a VSCode User settings entry.
 * @return A promise that resolves when the configuration is removed.
 */
export async function remove(section:string) {
	return await update(section, undefined);
}

/**
 * An interface for the VSCode Java configuration runtime.
 */
export interface IJavaConfigRuntime {
	readonly name: string;
	path: string;
	default?: boolean;
}

/**
 * Gets the Java runtime configurations for the VSCode Java extension.
 * @returns An array of Java runtime objects. If no entry exists, returns an empty array.
 */
export function getJavaConfigRuntimes(): IJavaConfigRuntime[] {
	return get(javaExtension.CONFIG_KEY_RUNTIMES) ?? [];
}

/**
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param latestLtsVersion The latest LTS version.
 * @return A promise that resolves when the configuration is updated.
 */
export async function updateJavaConfigRuntimes(
	runtimes:IJavaConfigRuntime[],
	runtimesOld:IJavaConfigRuntime[],
	latestLtsVersion:number) {

	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) { // null if no entry or null value
		remove(CONFIG_KEY_DEPRECATED_JAVA_HOME);
	}

	// VSCode LS Java Home (Fix if unsupported old version)
	const latestLtsRuntime = runtimes.find(r => r.name === javaExtension.nameOf(latestLtsVersion));
	if (latestLtsRuntime) {
		// Reload dialog on change only redhat.java extension (See: extension.ts addConfigChangeEvent)
		const configKeys = ['java.jdt.ls.java.home'];
		function _pushIf(extensionId:string, configKey:string) {
			if (vscode.extensions.getExtension(extensionId)) {configKeys.push(configKey);}
		}
		_pushIf('vmware.vscode-spring-boot', 'spring-boot.ls.java.home');
		_pushIf('redhat.vscode-rsp-ui', 'rsp-ui.rsp.java.home');
		
		for (const configKey of configKeys) {
			const originPath = get<string>(configKey);
			const latestLtsPath = latestLtsRuntime.path;
			let javaHome = null;
			if (originPath) {
				const fixedPath = await jdkExplorer.fixPath(originPath);
				if (fixedPath) {
					// RedHat LS minimum version check: REQUIRED_JDK_VERSION
					// https://github.com/redhat-developer/vscode-java/blob/master/src/requirements.ts
					const jdk = await jdkExplorer.findByPath(fixedPath);
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
				update(configKey, javaHome);

			}
		}
	}

	// Project Runtimes Default (Keep if set)
	const isNoDefault = !runtimes.find(r => r.default);
	if (isNoDefault || !_.isEqual(runtimes, runtimesOld)) {
		if (isNoDefault && latestLtsRuntime) {
			latestLtsRuntime.default = true;
		}
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		update(javaExtension.CONFIG_KEY_RUNTIMES, runtimes);
	}

	// Gradle Daemon Java Home (Fix if set), Note: If unset use java.jdt.ls.java.home
	const defaultRuntime = runtimes.find(r => r.default);
	if (defaultRuntime && vscode.extensions.getExtension('vscjava.vscode-gradle')) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = get<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
		if (originPath) {
			const fixedPath = await jdkExplorer.fixPath(originPath, defaultRuntime.path);
			if (fixedPath && fixedPath !== originPath) {
				update(CONFIG_KEY_GRADLE_JAVA_HOME, fixedPath);
			}
		} else {
			update(CONFIG_KEY_GRADLE_JAVA_HOME, defaultRuntime.path);
		}
	}

	// Project Maven Java Home (Keep if set)
	const isValidEnvJavaHome = await jdkExplorer.isValidHome(process.env.JAVA_HOME);
	if (defaultRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = get(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? [];
		let mavenJavaHome = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
		function _updateMavenJavaHome(newPath: string) {
			mavenJavaHome.value = newPath;
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
		if (mavenJavaHome) {
			const fixedPath = await jdkExplorer.fixPath(mavenJavaHome.value, defaultRuntime.path);
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
	let mvnExePath = get<string>(downloadMaven.CONFIG_KEY_MAVEN_EXE_PATH);
	if (!mvnExePath && !OS.isWindows) {
		mvnExePath = await autoContext.whichPath('mvn'); // (*1) For mac/Linux (Windows: Enable PATH)
	}
	if (mvnExePath) {
		mavenBinDir = path.join(mvnExePath, '..');
	}
	let gradleBinDir:string | undefined = undefined;
	const gradleHome = get<string>(downloadGradle.CONFIG_KEY_GRADLE_HOME);
	if (gradleHome) {
		gradleBinDir = path.join(gradleHome, 'bin');
	} else if (!OS.isWindows) {
		const gradleExePath = await autoContext.whichPath('gradle'); // (*1)
		if (gradleExePath) {
			gradleBinDir = path.join(gradleExePath, '..');
		}
	}
	function _setTerminalEnv(env:any, javaHome:string, runtimeName?:string) {
		const pathArray = [];
		pathArray.push(path.join(javaHome, 'bin'));
		// Gradle/Maven: From setting or mac/Linux 'which' (Unsupported older Java version)
		const javaVersion = javaExtension.versionOf(runtimeName ?? '') || latestLtsVersion;
		if (mavenBinDir && (javaVersion >= 8 || autoContext.isUserInstalled(mavenBinDir))) {
			// Minimum version https://maven.apache.org/developers/compatibility-plan.html
			pathArray.push(mavenBinDir);
		}
		if (gradleBinDir && (javaVersion >= 8 || autoContext.isUserInstalled(gradleBinDir))) {
			// Minimum version https://docs.gradle.org/current/userguide/compatibility.html
			pathArray.push(gradleBinDir);
		}
		// Add system environment vars (mac/Linux empty for default no rcfile)
		pathArray.push('${env:PATH}');
		env.PATH = pathArray.filter(Boolean).join(OS.isWindows ? ';' : ':');
		env.JAVA_HOME = javaHome;
	}
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	if (defaultRuntime && OS.isWindows) { // Exclude macOS (Support npm scripts)
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalEnv:any = _.cloneDeep(get(CONFIG_KEY_TERMINAL_ENV) ?? {}); // Proxy to POJO for isEqual
		function _updateTerminalDefault(newPath: string) {
			const terminalEnvOld = _.cloneDeep(terminalEnv);
			_setTerminalEnv(terminalEnv, newPath);
			if (!_.isEqual(terminalEnv, terminalEnvOld) ) {
				update(CONFIG_KEY_TERMINAL_ENV, terminalEnv);
			}
		}
		if (terminalEnv.JAVA_HOME) {
			const fixedPath = await jdkExplorer.fixPath(terminalEnv.JAVA_HOME, defaultRuntime.path);
			if (fixedPath) {
				_updateTerminalDefault(fixedPath);
			}
		} else if (!isValidEnvJavaHome) {
			_updateTerminalDefault(defaultRuntime.path);
		}
	}

	// Terminal Default Profile (Keep if set)
	if (OS.isWindows) {
		setIfUndefined('terminal.integrated.defaultProfile.windows', 'Command Prompt');
	}

	// Terminal Profiles Dropdown
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesOld:any = _.cloneDeep(get(CONFIG_KEY_TERMINAL_PROFILES)); // Proxy to POJO for isEqual
	const profilesNew:any = Object.fromEntries(Object.entries(profilesOld)
		.filter(([key, profile]) => !javaExtension.versionOf(key))); // Copy unmanaged profiles only

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
		_setTerminalEnv(profile.env, runtime.path, runtime.name);
		profilesNew[runtime.name] = profile;
	}
	if (!_.isEqual(profilesNew, profilesOld) ) {
		update(CONFIG_KEY_TERMINAL_PROFILES, profilesNew);
	}
}

function setIfUndefined(section:string, value:any, extensionName?:string) {
	if (extensionName && !vscode.extensions.getExtension(extensionName)) {
		return;
	}
	const config = vscode.workspace.getConfiguration();
	if (config.inspect(section)?.globalValue === undefined) {
		if (typeof value === 'function') {
			value(section);
		} else {
			update(section, value);
		}
	}
}

/**
 * Sets default values for VSCode settings.
 */
export function setDefault() {
	/* eslint-disable @typescript-eslint/naming-convention */
	// VSCode Editor
	setIfUndefined('editor.codeActionsOnSave', {
		"source.organizeImports": true
	});
	setIfUndefined('editor.linkedEditing', true);
	setIfUndefined('editor.minimap.enabled', false);
	setIfUndefined('editor.rulers', [
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
	setIfUndefined('editor.unicodeHighlight.includeComments', true);
	// VSCode Emmet
	setIfUndefined('emmet.variables', (section:string) => {
		update(section, {'lang': OS.locale.substring(0, 2)});
	});
	// VSCode Workbench
	setIfUndefined('workbench.colorCustomizations', {
		"[Default Dark Modern]": {
            "tab.activeBorderTop": "#00FF00",
            "tab.unfocusedActiveBorderTop" : "#00FF0088",
            "textCodeBlock.background": "#00000055",
        },
		"[Default Dark+][Visual Studio Dark]": {
			"tab.activeBorder": "#0F0",
		},
		"editor.wordHighlightStrongBorder": "#FF6347",
		"editor.wordHighlightBorder": "#FFD700",
		"editor.selectionHighlightBorder": "#A9A9A9",
	});
	setIfUndefined('workbench.tree.indent', 20);
	if (OS.isWindows) {
		setIfUndefined('files.eol', '\n');
		setIfUndefined('[bat]', {'files.eol': '\r\n'});
	}
	// VSCode Terminal
	setIfUndefined('terminal.integrated.enablePersistentSessions', false);
	setIfUndefined('terminal.integrated.tabs.hideCondition', 'never');
	// Java extensions
	setIfUndefined('java.debug.settings.hotCodeReplace', 'auto');
	setIfUndefined('java.sources.organizeImports.staticStarThreshold', 1);
	// Third party extensions
	setIfUndefined('cSpell.diagnosticLevel', 'Hint', 'streetsidesoftware.code-spell-checker');
	setIfUndefined('trailing-spaces.includeEmptyLines', false, 'shardulm94.trailing-spaces');
}
