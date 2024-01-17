/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as jdkutils from 'jdk-utils';
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
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
	const stableLtsRuntime = runtimes.findByVersion(javaConfig.stableLtsVer);
	const latestLtsRuntime = runtimes.findByVersion(javaConfig.latestLtsVer);

	// Project Runtimes Default (Keep if set)
	if (latestLtsRuntime && !runtimes.findDefault()) {
		latestLtsRuntime.default = true; // Multiple call safety to set latest
	}
	if (!_.isEqual(runtimes, runtimesOld)) {
		runtimes.sort((a, b) => a.name.localeCompare(b.name));
		update(redhat.JavaRuntimeArray.CONFIG_KEY, runtimes);
	}

	//-------------------------------------------------------------------------
	// Terminal Profiles Dropdown
	const osConfigName = OS.isWindows ? 'windows' : OS.isMac ? 'osx' : 'linux';
	const CONFIG_KEY_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + osConfigName;
	const profilesDef = getDefinition(CONFIG_KEY_TERMINAL_PROFILES) ?? {};
	const profilesOld:any = _.cloneDeep(profilesDef); // Proxy to POJO for isEqual
	const profilesNew:any = _.cloneDeep(profilesOld);
	const resourcesDir = system.getExtensionContext().asAbsolutePath('resources');
	for (const runtime of runtimes) {
		// Create from config runtimes (Always overwrite)
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		profile.env = {};
		if (OS.isWindows) {
			profile.path ||= 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
			profile.env.PATH = [path.join(runtime.path, 'bin'), '${env:PATH}'].join(path.delimiter);
		} else if (OS.isMac) {
			profile.path = 'zsh';
			profile.env.ZDOTDIR = resourcesDir;
		} else { // Linux
			profile.path = 'bash';
			profile.args = ['--rcfile', path.join(resourcesDir, '.bashrc')];
			// On macOS/Linux, npm error occurs if rcfile is disabled
		}
		profile.env.JAVA_HOME = runtime.path;
		profilesNew[runtime.name] = profile;
	}
	for (const runtimeName of Object.keys(profilesNew)) {
		// Fix except config runtimes (Remove invalid env JAVA_HOME)
		if (!runtimes.findByName(runtimeName)) {
			const javaHome = profilesNew[runtimeName]?.env?.JAVA_HOME;
			if (javaHome) {
				const fixed = await jdkExplorer.fixPath(javaHome);
				if (fixed) {
					profilesNew[runtimeName].env.JAVA_HOME = fixed;
				} else {
					delete profilesNew[runtimeName];
				}
			}
		}
	}
	const terminalDefaultRuntime = latestLtsRuntime || stableLtsRuntime;
	if (terminalDefaultRuntime) {
		// Create or update default zsh/bash profiles
		async function _setDefaultProfile(name: string, defaultJavaHome: string): Promise<any> {
			const profile = profilesNew[name] || {};
			profile.path = name;
			profile.env ||= {};
			profile.env.JAVA_HOME ||= defaultJavaHome;
			profilesNew[name] = profile;
			return profile;
		}
		if (OS.isMac) {
			const profile = await _setDefaultProfile('zsh', terminalDefaultRuntime.path);
			profile.env.ZDOTDIR = resourcesDir;
		} else if (OS.isLinux) {
			const profile = await _setDefaultProfile('bash', terminalDefaultRuntime.path);
			profile.args = ['--rcfile', path.join(resourcesDir, '.bashrc')];
		}
	}
	const names = Object.keys(profilesNew);
	const sortedNames = [
		...names.filter(name => !javaConfig.availableNames.includes(name)),
		...names.filter(name => javaConfig.availableNames.includes(name)).sort(),
	];
	const sortedProfiles = Object.fromEntries(sortedNames.map(name => [name, profilesNew[name]]));
	if (!_.isEqual(sortedProfiles, profilesOld)) {
		update(CONFIG_KEY_TERMINAL_PROFILES, sortedProfiles);
	}

	//-------------------------------------------------------------------------
	// Terminal Default Env Variables (Keep if set)
	if (terminalDefaultRuntime) {
		// [Windows] Default Command Prompt
		// prependPathEnv (without default JAVA_HOME) > terminal.integrated.env > original PATH
		if (OS.isWindows) {
			const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
			const terminalEnv:any = _.cloneDeep(get(CONFIG_KEY_TERMINAL_ENV) ?? {}); // Proxy to POJO for isEqual
			const terminalEnvOld = _.cloneDeep(terminalEnv);
			const fixedOrDefault = await jdkExplorer.fixPath(terminalEnv.JAVA_HOME) || terminalDefaultRuntime.path;
			terminalEnv.PATH = [path.join(fixedOrDefault, 'bin'), '${env:PATH}'].join(path.delimiter);
			terminalEnv.JAVA_HOME = fixedOrDefault;
			if (!_.isEqual(terminalEnv, terminalEnvOld)) {
				update(CONFIG_KEY_TERMINAL_ENV, terminalEnv);
			}
		}
		// [macOS/Linux] Default zsh/bash
		// Set by prependPathEnv because rcfile cannot be specified here (but preferred rcfile)
		// profile JAVA_HOME > prependPathEnv (with default JAVA_HOME) > original PATH
	}

	//-------------------------------------------------------------------------
	// Maven Terminal Custom Env (Keep if set)
	const mavenJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (mavenJavaRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = _.cloneDeep(get(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? []);
		const customEnvOld = _.cloneDeep(customEnv);
		const JAVA_HOME_ENV_NAME = 'JAVA_HOME';
		function _getEnvElement(envName: string) {
			return customEnv.find(i => i.environmentVariable === envName);
		}
		// [Windows/macOS/Linux]
		// Maven context menu JAVA_HOME (Update when switching from WSL to Windows)
		// Change the scope of maven.terminal.customEnv to machine-overridable
		// https://github.com/microsoft/vscode-maven/issues/991
		let javaHomeElement = _getEnvElement(JAVA_HOME_ENV_NAME);
		if (!javaHomeElement) {
			javaHomeElement = {environmentVariable: JAVA_HOME_ENV_NAME};
			customEnv.push(javaHomeElement);
		}
		javaHomeElement.value = await jdkExplorer.fixPath(javaHomeElement.value) || mavenJavaRuntime.path;

		// [Linux] JAVA_HOME: customEnv > profile
		// Maven uses the Java version of the default profile rcfile
		setIfUndefined('terminal.integrated.defaultProfile.' + osConfigName, mavenJavaRuntime.name);

		// [macOS] Custom .zshrc for JAVA_HOME (macOS maven menu)
		// maven.terminal.useJavaHome doesnt work if JAVA_HOME already set by shell startup scripts
		// https://github.com/microsoft/vscode-maven/issues/495#issuecomment-1869653082
		if (OS.isMac) {
			let zdotdirElement = _getEnvElement('ZDOTDIR');
			if (!zdotdirElement) {
				zdotdirElement = {environmentVariable: 'ZDOTDIR'};
				customEnv.push(zdotdirElement);
			}
			zdotdirElement.value = resourcesDir;
		}
		if (!_.isEqual(customEnv, customEnvOld)) {
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
	}

	//-------------------------------------------------------------------------
	// Gradle Daemon Java Home (Keep if set)
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
			const fixedOrDefault = await jdkExplorer.fixPath(originPath) || gradleJavaRuntime.path;
			if (fixedOrDefault !== originPath) {
				_updateGradleJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			_updateGradleJavaHome(gradleJavaRuntime.path);
		}
	}

	//-------------------------------------------------------------------------
	// VS Code LS Java Home (Remove if embedded JRE exists)
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

	//-------------------------------------------------------------------------
	// Optional Extensions LS Java Home (Keep if set)
	async function _updateOptionJavaHome(extensionId: string, configKey: string,
		optionalRuntime: redhat.IJavaRuntime | undefined)
	{
		if (!optionalRuntime || !vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = get<string>(configKey);
		if (originPath) {
			const fixedOrDefault = system.isUserInstalled(originPath)
				// Keep
				? await jdkExplorer.fixPath(originPath) || optionalRuntime.path
				// Update
				: optionalRuntime.path
			;
			if (fixedOrDefault !== originPath) {
				update(configKey, fixedOrDefault);
			}
		} else { // If unset use default
			update(configKey, optionalRuntime.path);
		}
	}
	const prevLtsRuntime = runtimes.findByVersion(javaConfig.downloadLtsVers.at(-2));
	_updateOptionJavaHome('salesforce.salesforcedx-vscode', 'salesforcedx-vscode-apex.java.home', prevLtsRuntime);
	_updateOptionJavaHome('redhat.vscode-rsp-ui', 'rsp-ui.rsp.java.home', stableLtsRuntime);

	//-------------------------------------------------------------------------
	// Optional Extensions java executable path (Keep if set)
	if (stableLtsRuntime && vscode.extensions.getExtension('jebbs.plantuml')) {
		const CONFIG_KEY_PLANTUML_JAVA = 'plantuml.java';
		const originPath = get<string>(CONFIG_KEY_PLANTUML_JAVA);
		if (!originPath || !system.existsFile(originPath)) {
			const newPath = path.join(stableLtsRuntime.path, 'bin', jdkutils.JAVA_FILENAME);
			update(CONFIG_KEY_PLANTUML_JAVA, newPath);
		}
	}
}

function setIfUndefined(section:string, value:any, extensionId?:string) {
	if (extensionId && !vscode.extensions.getExtension(extensionId)) {
		return;
	}
	if (getDefinition(section) === undefined) {
		update(section, value);
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
	setIfUndefined('emmet.variables', {'lang': OS.locale.substring(0, 2)});
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
		setIfUndefined('[bat]', {'files.eol': '\r\n'});
	}
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
	// Optional extensions
	setIfUndefined('thunder-client.requestLayout', 'Top/Bottom', 'rangav.vscode-thunder-client');
}
