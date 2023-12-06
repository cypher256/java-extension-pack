/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import * as gradle from './download/gradle';
import * as maven from './download/maven';
import * as jdkExplorer from './jdkExplorer';
import * as jdtExtension from './jdtExtension';
import * as system from './system';
import { OS, log } from './system';

/**
 * Return a value from user settings configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @return The value `section` denotes or `undefined`. null is a valid value.
 */
export function get<T>(section: string): T | undefined {
	const info = vscode.workspace.getConfiguration().inspect(section);
	return (info?.globalValue ?? info?.defaultValue) as T;
}

function getGlobalOnly<T>(section: string): T | undefined {
	const info = vscode.workspace.getConfiguration().inspect(section);
	return info?.globalValue as T;
}

/**
 * Updates a VS Code user settings entry.
 * @param section Configuration name, supports _dotted_ names.
 * @param value The new value. Remove configuration entry when passed `undefined`.
 * @return A promise that resolves when the configuration is updated.
 */
export async function update(section:string, value:any) {
	log.info('Update settings:', section, _.isObject(value) ? '' : value);
	const config = vscode.workspace.getConfiguration();
	return await config.update(section, value, vscode.ConfigurationTarget.Global);
}

/**
 * Removes a VS Code User settings entry.
 * @param section Configuration name, supports _dotted_ names.
 * @return A promise that resolves when the configuration is removed.
 */
export async function remove(section:string) {
	return await update(section, undefined);
}

/**
 * Gets the Java runtime configurations for the VS Code Java extension.
 * @returns An array of Java runtime objects. If no entry exists, returns an empty array.
 */
export function getJavaConfigRuntimes(): jdtExtension.JavaConfigRuntimeArray {
	const runtimes:jdtExtension.IJavaConfigRuntime[] = get(jdtExtension.JavaConfigRuntimeArray.CONFIG_KEY) ?? [];
	return new jdtExtension.JavaConfigRuntimeArray(...runtimes);
}

/**
 * Updates the Java runtime configurations for the VS Code Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param jdtSupport The JDT supported version object.
 * @return A promise that resolves when the configuration is updated.
 */
export async function updateJavaConfig(
	runtimes:jdtExtension.JavaConfigRuntimeArray,
	runtimesOld:jdtExtension.JavaConfigRuntimeArray,
	jdtSupport: jdtExtension.IJdtSupport) {

	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) { // null if no entry or null value
		remove(CONFIG_KEY_DEPRECATED_JAVA_HOME);
	}

	// VS Code LS Java Home (Fix if unsupported old version)
	let lsRuntime = undefined;
	let lsVer = 0;
	if (jdtSupport.embeddedJreVer) {
		lsRuntime = runtimes.findByVersion(jdtSupport.embeddedJreVer);
		lsVer = jdtSupport.embeddedJreVer;
	}
	const stableLtsRuntime = runtimes.findByVersion(jdtSupport.stableLtsVer);
	if (!lsRuntime && stableLtsRuntime) {
		lsRuntime = stableLtsRuntime;
		lsVer = jdtSupport.stableLtsVer;
	}
	if (lsRuntime) {
		// Reload dialog on change only redhat.java extension (See: extension.ts onDidChangeConfiguration)
		const configKeys = ['java.jdt.ls.java.home'];
		function _pushIf(extensionId:string, configKey:string) {
			if (vscode.extensions.getExtension(extensionId)) {configKeys.push(configKey);}
		}
		_pushIf('vmware.vscode-spring-boot', 'spring-boot.ls.java.home');
		_pushIf('redhat.vscode-rsp-ui', 'rsp-ui.rsp.java.home');
		
		for (const configKey of configKeys) {
			const originPath = get<string>(configKey);
			const _updateLs = (p:string) => update(configKey, p);
			const lsRuntimePath = lsRuntime.path;
			if (originPath) {
				const fixedOriginPath = await jdkExplorer.fixPath(originPath);
				if (fixedOriginPath) {
					// RedHat LS minimum version check: REQUIRED_JDK_VERSION
					// https://github.com/redhat-developer/vscode-java/blob/master/src/requirements.ts
					const originJdk = await jdkExplorer.findByPath(fixedOriginPath);
					if (!originJdk || originJdk.majorVersion < lsVer) {
						_updateLs(lsRuntimePath); // Fix unsupported older version
					} else if (originJdk.majorVersion === lsVer && originJdk.homePath !== lsRuntimePath) {
						_updateLs(lsRuntimePath); // Same version, different path
					} else if (fixedOriginPath !== originPath) {
						_updateLs(fixedOriginPath); // Fix invalid
					} else {
						// Keep new version
					}
				} else {
					_updateLs(lsRuntimePath); // Can't fix
				}
			} else {
				_updateLs(lsRuntimePath); // if unset
			}
		}
	}

	// Project Runtimes Default (Keep if set)
	const latestLtsRuntime = runtimes.findByVersion(jdtSupport.latestLtsVer);
	if (latestLtsRuntime && !runtimes.findDefault()) {
		latestLtsRuntime.default = true;
	}
	if (!_.isEqual(runtimes, runtimesOld)) {
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		update(jdtExtension.JavaConfigRuntimeArray.CONFIG_KEY, runtimes);
	}

	// Gradle Daemon Java Home (Keep if set)
	/*
	let gradleJavaRuntime = stableLtsRuntime;
	const GRADLE_FULL_SUPPORTED_MAX_JAVA_LTS_VER = 21;
	if (latestLtsRuntime && jdtSupport.latestLtsVer <= GRADLE_FULL_SUPPORTED_MAX_JAVA_LTS_VER) {
		gradleJavaRuntime = latestLtsRuntime;
	}
	*/
	// Gradle 8.5 can execute on Java 22+
	// https://github.com/gradle/gradle/issues/26944#issuecomment-1794419074
	const gradleJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (gradleJavaRuntime && vscode.extensions.getExtension('vscjava.vscode-gradle')) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = get<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
		function _updateGradleJavaHome(newPath: string) {
			update(CONFIG_KEY_GRADLE_JAVA_HOME, newPath);
			jdtSupport.needsReload = true; // Restart Gradle Daemon
		}
		if (originPath) {
			const fixedOrDefault = system.isUserInstalled(originPath) || !gradle.isAutoUpdate()
				? /* Keep */ await jdkExplorer.fixPath(originPath) || gradleJavaRuntime.path
				: /* Auto-update */ gradleJavaRuntime.path
			;
			if (fixedOrDefault !== originPath) {
				_updateGradleJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			_updateGradleJavaHome(gradleJavaRuntime.path);
		}
	}

	// Maven Java Home (Keep if set)
	const mavenJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (mavenJavaRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = get(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? [];
		let mavenJavaHomeObj = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
		const originPath:string | undefined = mavenJavaHomeObj?.value;
		function _updateMavenJavaHome(newPath: string) {
			mavenJavaHomeObj.value = newPath;
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
		if (originPath) {
			const fixedOrDefault = system.isUserInstalled(originPath) || !maven.isAutoUpdate()
				? /* Keep */ await jdkExplorer.fixPath(originPath) || mavenJavaRuntime.path
				: /* Auto-update */ mavenJavaRuntime.path
			;
			if (fixedOrDefault !== originPath) {
				_updateMavenJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			mavenJavaHomeObj = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHomeObj);
			_updateMavenJavaHome(mavenJavaRuntime.path);
		}
	}

	// Terminal Default Environment Variables (Keep if set)
	let mavenBinDir:string | undefined = undefined;
	let mvnExePath = get<string>(maven.CONFIG_KEY_MAVEN_EXE_PATH);
	if (!mvnExePath && !OS.isWindows) {
		mvnExePath = await system.whichPath('mvn'); // Fallback for mac/Linux (Windows: Use ${env:PATH})
	}
	if (mvnExePath) {
		mavenBinDir = path.join(mvnExePath, '..');
	}
	let gradleBinDir:string | undefined = undefined;
	const gradleHome = get<string>(gradle.CONFIG_KEY_GRADLE_HOME);
	if (gradleHome) {
		gradleBinDir = path.join(gradleHome, 'bin');
	} else if (!OS.isWindows) {
		const gradleExePath = await system.whichPath('gradle'); // Fallback for mac/Linux (Windows: Use ${env:PATH})
		if (gradleExePath) {
			gradleBinDir = path.join(gradleExePath, '..');
		}
	}
	function _setTerminalEnv(env:any, javaHome:string, runtimeName?:string) {
		const pathArray = [];
		pathArray.push(path.join(javaHome, 'bin'));
		// Gradle/Maven: From setting or mac/Linux 'which' (Unsupported older Java version)
		const javaVersion = jdtExtension.versionOf(runtimeName ?? '') || Number.MAX_SAFE_INTEGER;
		if (mavenBinDir && (javaVersion >= 8 || system.isUserInstalled(mavenBinDir))) {
			// Minimum version https://maven.apache.org/developers/compatibility-plan.html
			pathArray.push(mavenBinDir);
		}
		if (gradleBinDir && (javaVersion >= 8 || system.isUserInstalled(gradleBinDir))) {
			// Minimum version https://docs.gradle.org/current/userguide/compatibility.html
			pathArray.push(gradleBinDir);
		}
		// Add system environment vars (mac/Linux empty for default no rcfile)
		pathArray.push('${env:PATH}');
		env.PATH = pathArray.filter(Boolean).join(OS.isWindows ? ';' : ':');
		env.JAVA_HOME = javaHome;
	}
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	const terminalDefaultRuntime = latestLtsRuntime || stableLtsRuntime;
	if (terminalDefaultRuntime && OS.isWindows) { // Exclude macOS (Support npm scripts)
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
			const fixedOrDefault = await jdkExplorer.fixPath(terminalEnv.JAVA_HOME) || terminalDefaultRuntime.path;
			_updateTerminalDefault(fixedOrDefault);
		} else {
			_updateTerminalDefault(terminalDefaultRuntime.path);
		}
	}

	// Terminal Default Profile (Keep if set)
	if (OS.isWindows) {
		setIfUndefined('terminal.integrated.defaultProfile.windows', 'Command Prompt');
	}

	// Terminal Profiles Dropdown (Always update)
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesGlobal = getGlobalOnly(CONFIG_KEY_TERMINAL_PROFILES) ?? {};
	const profilesOld:any = _.cloneDeep(profilesGlobal); // Proxy to POJO for isEqual
	const profilesNew:any = _.cloneDeep(profilesOld);

	for (const runtimeName of Object.keys(profilesNew)) {
		// Clean Dropdown (Remove invalid path)
		if (!runtimes.findByName(runtimeName)) {
			const javaHome = profilesNew[runtimeName]?.env?.JAVA_HOME;
			if (javaHome && !await jdkExplorer.isValidHome(javaHome)) {
				delete profilesNew[runtimeName];
			}
		}
	}
	for (const runtime of runtimes) {
		// Set Dropdown from runtimes
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		profile.env ??= {};
		if (OS.isWindows) {
			profile.path ??= 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
		} else if (OS.isMac) {
			profile.path ??= 'zsh';
			profile.args ??= ['-l']; // Disable .zshrc JAVA_HOME in _setTerminalEnv ZDOTDIR
			profile.env.ZDOTDIR ??= '~/.zsh_jdkauto'; // Disable .zshrc JAVA_HOME
		} else {
			profile.path ??= 'bash';
			profile.args ??= ['--rcfile', '~/.bashrc_jdkauto']; // Disable .bashrc JAVA_HOME (also WSL)
		}
		_setTerminalEnv(profile.env, runtime.path, runtime.name);
		profilesNew[runtime.name] = profile;
	}
	const sortedNew = Object.fromEntries(Object.keys(profilesNew).sort().map(key => [key, profilesNew[key]]));
	if (!_.isEqual(sortedNew, profilesOld) ) {
		update(CONFIG_KEY_TERMINAL_PROFILES, sortedNew);
	}
}

function setIfUndefined(section:string, value:any, extensionName?:string) {
	if (extensionName && !vscode.extensions.getExtension(extensionName)) {
		return;
	}
	if (getGlobalOnly(section) === undefined) {
		if (typeof value === 'function') {
			value(section);
		} else {
			update(section, value);
		}
	}
}

/**
 * Sets default values for VS Code settings.
 */
export function setDefault() {
	// VS Code Editor
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
	// VS Code Emmet
	setIfUndefined('emmet.variables', (section:string) => {
		update(section, {'lang': OS.locale.substring(0, 2)});
	});
	// VS Code Workbench
	setIfUndefined('workbench.colorCustomizations', {
		"[Default Dark Modern]": {
            "tab.activeBorderTop": "#00FF00",
            "tab.unfocusedActiveBorderTop" : "#00FF0088",
            "textCodeBlock.background": "#00000055",
        },
		"editor.wordHighlightStrongBorder": "#FF6347",
		"editor.wordHighlightBorder": "#FFD700",
		"editor.selectionHighlightBorder": "#A9A9A9",
	});
	setIfUndefined('workbench.editor.revealIfOpen', true);
	setIfUndefined('workbench.tree.indent', 20);
	if (OS.isWindows) {
		setIfUndefined('files.eol', '\n');
	}
	setIfUndefined('[bat]', {'files.eol': '\r\n'});
	// VS Code Terminal
	setIfUndefined('terminal.integrated.enablePersistentSessions', false);
	setIfUndefined('terminal.integrated.tabs.hideCondition', 'never');
	// Java extensions
	setIfUndefined('java.configuration.updateBuildConfiguration', 'automatic');
	setIfUndefined('java.debug.settings.hotCodeReplace', 'auto');
	setIfUndefined('java.sources.organizeImports.staticStarThreshold', 1);
	// Included extensions
	setIfUndefined('cSpell.diagnosticLevel', 'Hint', 'streetsidesoftware.code-spell-checker');
	setIfUndefined('trailing-spaces.includeEmptyLines', false, 'shardulm94.trailing-spaces');
	// Other extensions
	setIfUndefined('thunder-client.requestLayout', 'Top/Bottom', 'rangav.vscode-thunder-client');
}
