/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import * as gradle from './download/gradle';
import * as maven from './download/maven';
import * as jdkExplorer from './jdkExplorer';
import * as redhat from './redhat';
import * as system from './system';
import { OS, log } from './system';

/**
 * Return a value from user settings configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @returns The value `section` denotes or `undefined`. null is a valid value.
 */
export function get<T>(section: string): T | undefined {
	const info = vscode.workspace.getConfiguration().inspect(section);
	// User settings.json or extensions default
	return (info?.globalValue ?? info?.defaultValue) as T;
}

function getDefinition<T>(section: string): T | undefined {
	const info = vscode.workspace.getConfiguration().inspect(section);
	// User settings.json only
	return info?.globalValue as T;
}

/**
 * Updates a VS Code user settings entry.
 * @param section Configuration name, supports _dotted_ names.
 * @param value The new value. Remove configuration entry when passed `undefined`.
 * @returns A promise that resolves when the configuration is updated.
 */
export async function update(section:string, value:any) {
	const config = vscode.workspace.getConfiguration();
	value = Array.isArray(value) && value.length === 0 ? undefined : value;
	log.info(`${value ? 'Update' : 'Remove'} settings:`, section, _.isObject(value) ? '' : value);
	return await config.update(section, value, vscode.ConfigurationTarget.Global);
}

/**
 * Removes a VS Code User settings entry.
 * @param section Configuration name, supports _dotted_ names.
 * @returns A promise that resolves when the configuration is removed.
 */
export async function remove(section:string) {
	return await update(section, undefined);
}

/**
 * Gets the Java runtime configurations for the VS Code Java extension.
 * @returns An array of Java runtime objects. If no entry exists, returns an empty array.
 */
export function getJavaRuntimes(): redhat.JavaRuntimeArray {
	const runtimes:redhat.IJavaRuntime[] = get(redhat.JavaRuntimeArray.CONFIG_KEY) ?? [];
	return new redhat.JavaRuntimeArray(...runtimes);
}

/**
 * Updates the Java runtime configurations for the VS Code Java extension.
 * @param javaConfig The Java configuration.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @returns A promise that resolves when the configuration is updated.
 */
export async function updateJavaRuntimes(
	javaConfig: redhat.IJavaConfig,
	runtimes:redhat.JavaRuntimeArray,
	runtimesOld:redhat.JavaRuntimeArray) {

	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) { // null if no entry or null value
		remove(CONFIG_KEY_DEPRECATED_JAVA_HOME);
	}

	// VS Code LS Java Home (Remove if embedded JRE exists)
	const stableLtsRuntime = runtimes.findByVersion(javaConfig.stableLtsVer);
	async function _updateLsJavaHome(extensionId: string, configKey: string) {
		if (!vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = get<string>(configKey);
		if (javaConfig.embeddedJreVer) {
			if (originPath) {
				remove(configKey); // Use embedded JRE
			}
			return;
		}
		const fixedOrDefault = stableLtsRuntime?.path || await jdkExplorer.fixPath(originPath);
		if (fixedOrDefault && fixedOrDefault !== originPath) { // Keep if undefined (= invalid path)
			update(configKey, fixedOrDefault);
		}
	}
	_updateLsJavaHome('redhat.java', 'java.jdt.ls.java.home');
	_updateLsJavaHome('vmware.vscode-spring-boot', 'spring-boot.ls.java.home');

	// [Option] RSP Java Home (Keep if set)
	const rspJavaRuntime = stableLtsRuntime;
	if (rspJavaRuntime && vscode.extensions.getExtension('redhat.vscode-rsp-ui')) {
		const CONFIG_KEY_RSP_JAVA_HOME = 'rsp-ui.rsp.java.home';
		const originPath = get<string>(CONFIG_KEY_RSP_JAVA_HOME);
		if (originPath) {
			const fixedOrDefault = system.isUserInstalled(originPath)
				// Keep
				? await jdkExplorer.fixPath(originPath) || rspJavaRuntime.path
				// Update
				: rspJavaRuntime.path
			;
			if (fixedOrDefault !== originPath) {
				update(CONFIG_KEY_RSP_JAVA_HOME, fixedOrDefault);
			}
		} else { // If unset use default
			update(CONFIG_KEY_RSP_JAVA_HOME, rspJavaRuntime.path);
		}
	}

	// Project Runtimes Default (Keep if set)
	const latestLtsRuntime = runtimes.findByVersion(javaConfig.latestLtsVer);
	if (latestLtsRuntime && !runtimes.findDefault()) {
		latestLtsRuntime.default = true; // Multiple call safety to set latest
	}
	if (!_.isEqual(runtimes, runtimesOld)) {
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		update(redhat.JavaRuntimeArray.CONFIG_KEY, runtimes);
	}

	// Set Terminal Env Function
	const useWhich = !OS.isWindows; // true:mac/Linux (Because available ${env:PATH} on Windows)
	const mavenBinDir = await maven.getBinDir(useWhich);
	const gradleBinDir = await gradle.getBinDir(useWhich);
	function _setTerminalEnv(env:any, javaHome:string, runtimeName?:string) {
		const pathArray = [];
		pathArray.push(path.join(javaHome, 'bin'));
		// Gradle/Maven: From setting or mac/Linux 'which' (Unsupported older Java version)
		const javaVersion = redhat.versionOf(runtimeName ?? '') || Number.MAX_SAFE_INTEGER;
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

	// Terminal Profiles Dropdown (Always update)
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesDef = getDefinition(CONFIG_KEY_TERMINAL_PROFILES) ?? {};
	const profilesOld:any = _.cloneDeep(profilesDef); // Proxy to POJO for isEqual
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
	for (const runtime of runtimes) { // Set Dropdown from runtimes
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		profile.env ??= {};
		if (OS.isWindows) {
			profile.path ??= 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
		} else if (OS.isMac) {
			profile.path ??= 'zsh';
			profile.args ??= ['-l']; // login shell
			profile.env.ZDOTDIR ??= '~/.zsh_autoconfig'; // Disable .zshrc JAVA_HOME
		} else {
			profile.path ??= 'bash';
			profile.args ??= ['--rcfile', '~/.bashrc_autoconfig']; // Disable .bashrc JAVA_HOME (also WSL)
		}
		_setTerminalEnv(profile.env, runtime.path, runtime.name);
		profilesNew[runtime.name] = profile;
	}
	const sortedNew = Object.fromEntries(Object.keys(profilesNew).sort().map(key => [key, profilesNew[key]]));
	if (!_.isEqual(sortedNew, profilesOld)) {
		update(CONFIG_KEY_TERMINAL_PROFILES, sortedNew);
	}

	// Terminal Default Environment Variables (Keep if set)
	// [Windows] maven context menu JAVA_HOME
	const terminalDefaultRuntime = latestLtsRuntime || stableLtsRuntime;
	if (terminalDefaultRuntime && OS.isWindows) { // Excludes macOS/Linux because uses npm scripts
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalEnv:any = _.cloneDeep(get(CONFIG_KEY_TERMINAL_ENV) ?? {}); // Proxy to POJO for isEqual
		const terminalEnvOld = _.cloneDeep(terminalEnv);
		const fixedOrDefault = await jdkExplorer.fixPath(terminalEnv.JAVA_HOME) || terminalDefaultRuntime.path;
		_setTerminalEnv(terminalEnv, fixedOrDefault);
		if (!_.isEqual(terminalEnv, terminalEnvOld) ) {
			update(CONFIG_KEY_TERMINAL_ENV, terminalEnv);
		}
	}

	// Maven terminal common env (Keep if set)
	// [macOS/Linux] maven context menu JAVA_HOME
	const mavenJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
	const customEnv:any[] = get(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? [];
	let mavenJavaHomeObj = customEnv.find(i => i.environmentVariable === 'JAVA_HOME');
	const mavenJavaHome:string | undefined = mavenJavaHomeObj?.value;
	if (OS.isWindows) {
		// Remove Linux path when switching from WSL to Windows
		// https://github.com/microsoft/vscode-maven/issues/991
		if (mavenJavaHome && !await jdkExplorer.isValidHome(mavenJavaHome)) {
			customEnv.splice(customEnv.indexOf(mavenJavaHomeObj), 1); // Remove entry
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
	} else if (mavenJavaRuntime) {
		function _updateMavenJavaHome(newPath: string) {
			mavenJavaHomeObj.value = newPath;
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
		if (mavenJavaHome) {
			const fixedOrDefault = system.isUserInstalled(mavenJavaHome) || !maven.isAutoUpdate()
				// Keep
				? await jdkExplorer.fixPath(mavenJavaHome) || mavenJavaRuntime.path
				// Auto-update
				: mavenJavaRuntime.path
			;
			if (fixedOrDefault !== mavenJavaHome) {
				_updateMavenJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			mavenJavaHomeObj = {environmentVariable: 'JAVA_HOME'};
			customEnv.push(mavenJavaHomeObj);
			_updateMavenJavaHome(mavenJavaRuntime.path);
		}
	}

	// Gradle Daemon Java Home (Keep if set)
	/*
	let gradleJavaRuntime = stableLtsRuntime;
	const GRADLE_FULL_SUPPORTED_MAX_JAVA_LTS_VER = 21;
	if (latestLtsRuntime && javaConfig.latestLtsVer <= GRADLE_FULL_SUPPORTED_MAX_JAVA_LTS_VER) {
		gradleJavaRuntime = latestLtsRuntime;
	}
	*/
	// Gradle 8.5+ can execute on latest Java versions
	// https://github.com/gradle/gradle/issues/26944#issuecomment-1794419074
	const gradleJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (gradleJavaRuntime && vscode.extensions.getExtension('vscjava.vscode-gradle')) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = get<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
		function _updateGradleJavaHome(newPath: string) {
			update(CONFIG_KEY_GRADLE_JAVA_HOME, newPath);
			javaConfig.needsReload = true;
			log.info('Needs Reload: Restart Gradle Daemon');
		}
		if (originPath) {
			const fixedOrDefault = system.isUserInstalled(originPath) || !gradle.isAutoUpdate()
				// Keep
				? await jdkExplorer.fixPath(originPath) || gradleJavaRuntime.path
				// Auto-update
				: gradleJavaRuntime.path
			;
			if (fixedOrDefault !== originPath) {
				_updateGradleJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			_updateGradleJavaHome(gradleJavaRuntime.path);
		}
	}
}

function setIfUndefined(section:string, value:any, extensionId?:string) {
	if (extensionId && !vscode.extensions.getExtension(extensionId)) {
		return;
	}
	if (getDefinition(section) === undefined) {
		if (typeof value === 'function') {
			value(section);
		} else {
			update(section, value);
		}
	}
}

/**
 * Sets default values for VS Code settings.
 * @param javaConfig The Java configuration.
 */
export async function setDefault(javaConfig: redhat.IJavaConfig) {

	// Workaround: Uninstall extension that cause configuration errors
	// https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/503
	// https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/665
	const redhatDependExId = 'redhat.fabric8-analytics';
	if (vscode.extensions.getExtension(redhatDependExId)) {
		if (!await jdkExplorer.isValidHome(process.env.JAVA_HOME) ||
			(!get('redHatDependencyAnalytics.mvn.executable.path') && !(await system.whichPath('mvn')))
		) {
			log.warn('Needs Reload: Uninstall extension', redhatDependExId);
			vscode.commands.executeCommand('workbench.extensions.uninstallExtension', redhatDependExId);
			javaConfig.needsReload = true;
		}
	}

	// VS Code Editor
	setIfUndefined('editor.codeActionsOnSave', {
		"source.organizeImports": 'explicit'
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
	if (OS.isWindows) {
		setIfUndefined('terminal.integrated.defaultProfile.windows', 'Command Prompt');
	}
	// Other extensions
	setIfUndefined('thunder-client.requestLayout', 'Top/Bottom', 'rangav.vscode-thunder-client');
}
