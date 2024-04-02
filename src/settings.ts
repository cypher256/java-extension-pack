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
 * Return a value from user/remote settings.json or default configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @returns The value `section` denotes or `undefined`. null is a valid value.
 */
export function getUser<T>(section: string): T | undefined {
	// Pending: ${userHome}
	// Issue: Support variables when resolving values in settings
	// Open) https://github.com/microsoft/vscode/issues/2809#new_comment_form
	const info = vscode.workspace.getConfiguration().inspect(section);
	return (info?.globalValue ?? info?.defaultValue) as T;
}

/**
 * Return a value from user/remote settings.json.
 * @param section Configuration name, supports _dotted_ names.
 * @returns The value `section` denotes or `undefined`. null is a valid value.
 */
export function getUserDef<T>(section: string): T | undefined {
	const info = vscode.workspace.getConfiguration().inspect(section);
	return info?.globalValue as T;
}

/**
 * Return a value from workspace configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @returns The value `section` denotes or `undefined`. null is a valid value.
 */
export function getWorkspace<T>(section: string): T | undefined {
	return vscode.workspace.getConfiguration().get(section);
}

/**
 * Updates a VS Code user/remote settings entry.
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
 * Removes a VS Code user/remote settings entry.
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
	const redhatRuntimes:redhat.IJavaRuntime[] = getUser(redhat.JavaRuntimeArray.CONFIG_KEY) ?? [];
	return new redhat.JavaRuntimeArray(...redhatRuntimes);
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
	if (getUser(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) { // null if no entry or null value
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
	const profilesDef = getUserDef(CONFIG_KEY_TERMINAL_PROFILES) ?? {};
	const profilesOld:any = _.cloneDeep(profilesDef); // Proxy to POJO for isEqual
	const profilesNew:any = _.cloneDeep(profilesOld);
	const _createPathPrepend = (javaHome: string) => [path.join(javaHome, 'bin'), '${env:PATH}'].join(path.delimiter);
	const rcfileDir = system.getGlobalStoragePath();
	for (const runtime of runtimes) {
		// Create from config runtimes (Always overwrite)
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		profile.env = {};
		if (OS.isWindows) {
			profile.path = 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
			profile.env.PATH = _createPathPrepend(runtime.path);
			if (redhat.versionOf(runtime.name) >= 18) {
				// Support JEP 400 UTF-8 Default
				// Unsupported System.in UTF-8: https://bugs.openjdk.org/browse/JDK-8295672
				profile.args = ["/k", "chcp", "65001"]; // Requires automationProfile
				// JAVA_TOOL_OPTIONS doesn't work in Gradle task UI (Specify in build.gradle instead)
				// [build.gradle] applicationDefaultJvmArgs = ['-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8']
				//profile.env.JAVA_TOOL_OPTIONS = '-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8'; // Java 19+
			}
		} else if (OS.isMac) {
			profile.path = 'zsh';
			profile.env.ZDOTDIR = rcfileDir;
		} else { // Linux
			profile.path = 'bash';
			profile.args = ['--rcfile', path.join(rcfileDir, '.bashrc')];
			// Do not use --login because disables --rcfile
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
		// On macOS/Linux, npm error occurs if rcfile is disabled
		const _setDefaultProfile = async (name: string) => {
			const profile = profilesNew[name] || {};
			profile.path = name;
			profile.env ||= {};
			profile.env.JAVA_HOME = await jdkExplorer.fixPath(profile.env.JAVA_HOME) || terminalDefaultRuntime.path;
			profilesNew[name] = profile;
			return profile;
		};
		if (OS.isMac) {
			const profile = await _setDefaultProfile('zsh'); // Inherited -l from default profile
			profile.env.ZDOTDIR = rcfileDir;
		} else if (OS.isLinux) {
			const profile = await _setDefaultProfile('bash');
			profile.args = ['--rcfile', path.join(rcfileDir, '.bashrc')];
		}
	}
	const profileNames = Object.keys(profilesNew);
	const javaNamePattern = /^J.+SE-/;
	const sortedNames = [
		...profileNames.filter(name => !name.match(javaNamePattern)), // Keep order
		...profileNames.filter(name => name.match(javaNamePattern)).sort(),
	];
	const sortedProfiles = Object.fromEntries(sortedNames.map(name => [name, profilesNew[name]]));
	if (!_.isEqual(sortedProfiles, profilesOld)) {
		update(CONFIG_KEY_TERMINAL_PROFILES, sortedProfiles);
		// [Windows/macOS/Linux] Default profile
		// Linux Maven uses the Java version of the default profile rcfile
		if (terminalDefaultRuntime) {
			setIfUndefined('terminal.integrated.defaultProfile.' + osConfigName, terminalDefaultRuntime.name);
		}
		if (OS.isWindows) {
			// defaultProfile & args chcp 'Incorrect parameter format -/d' support
			// https://github.com/microsoft/vscode/issues/202691
			update(`terminal.integrated.automationProfile.windows`, {"path": "cmd"});
		}
	}

	//-------------------------------------------------------------------------
	// Terminal Default Env Variables (Keep if set)
	if (terminalDefaultRuntime) {
		// [Windows] Default cmd/powershell (gitbash not supported)
		// Run/Debug is launched using project's java.exe for No-build-tools/maven/gradle
		// PRECEDENCE: Env Gradle/Maven > terminal.integrated.env JAVA_HOME > original PATH
		if (OS.isWindows) {
			const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
			const terminalEnv:any = _.cloneDeep(getUser(CONFIG_KEY_TERMINAL_ENV) ?? {}); // Proxy to POJO for isEqual
			const terminalEnvOld = _.cloneDeep(terminalEnv);
			terminalEnv.JAVA_HOME = await jdkExplorer.fixPath(terminalEnv.JAVA_HOME) || terminalDefaultRuntime.path;
			terminalEnv.PATH = _createPathPrepend(terminalEnv.JAVA_HOME);
			if (!_.isEqual(terminalEnv, terminalEnvOld)) {
				update(CONFIG_KEY_TERMINAL_ENV, terminalEnv);
			}
		}
		// [macOS/Linux] Use custom rcfile in zsh/bash
		// PRECEDENCE: profile JAVA_HOME > Env Gradle/Maven > original PATH
	}

	//-------------------------------------------------------------------------
	// Maven Terminal Custom Env (Keep if set)
	const mavenJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (mavenJavaRuntime) {
		const CONFIG_KEY_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv:any[] = _.cloneDeep(getUser(CONFIG_KEY_MAVEN_CUSTOM_ENV) ?? []);
		const customEnvOld = _.cloneDeep(customEnv);
		function _getCustomEnv(envName: string): {value: string} {
			let element = customEnv.find(i => i.environmentVariable === envName);
			if (!element) {
				element = {environmentVariable: envName};
				customEnv.push(element);
			}
			return element;
		}

		// [Windows]     PRECEDENCE: Env Gradle/Maven > customEnv > terminal.integrated.env > original PATH
		// [macOS/Linux] PRECEDENCE: customEnv > .*shrc JAVA_HOME > Env Gradle/Maven > original PATH
		// Issue: Option to use specific Java SDK to run Maven
		//   Open) https://github.com/microsoft/vscode-maven/issues/992
		// Issue: Change the scope of maven.terminal.customEnv to machine-overridable
		//   Open) https://github.com/microsoft/vscode-maven/issues/991
		const javaHomeEnv = _getCustomEnv('JAVA_HOME');
		javaHomeEnv.value = await jdkExplorer.fixPath(javaHomeEnv.value) || mavenJavaRuntime.path;

		// [Windows] maven and gradle don't need java/bin in PATH (java command cannot be executed)
		// [Linux/macOS] PATH is not required because defaultProfile's rcfile is used
		_.remove(customEnv, {environmentVariable: 'PATH'}); // Remove for previous version
		/*
		if (OS.isWindows) {
			// [Windows] PATH: for java command (mvn and gradle work without java/bin in PATH)
			_getCustomEnv('PATH').value = _createPathPrepend(javaHomeEnv.value);
		} else {
			// [Linux/macOS] PATH: Remove when switching from Windows to WSL
			_.remove(customEnv, {environmentVariable: 'PATH'});
		}
		*/

		// [macOS] Use custom rcfile in zsh
		// Issue: maven.terminal.useJavaHome doesnt work if JAVA_HOME already set by shell startup scripts
		// Open) https://github.com/microsoft/vscode-maven/issues/495#issuecomment-1869653082
		if (OS.isMac) {
			_getCustomEnv('ZDOTDIR').value = rcfileDir;
		}
		
		if (!_.isEqual(customEnv, customEnvOld)) {
			update(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
		}
	}

	//-------------------------------------------------------------------------
	// Gradle Daemon Java Home (Keep if set): Output > Gradle for Java > Java Home
	// Gradle 8.5+ can execute on latest Java versions
	// Closed) https://github.com/gradle/gradle/issues/26944#issuecomment-1794419074
	const gradleJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (gradleJavaRuntime && vscode.extensions.getExtension('vscjava.vscode-gradle')) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = getUser<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
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
		// Pending: org.gradle.java.installations.paths
		// Open) https://github.com/microsoft/vscode-gradle/issues/1330
	}

	//-------------------------------------------------------------------------
	// VS Code LS Java Home (Remove if embedded JRE exists)
	async function _useEmbeddedJre(extensionId: string, configKey: string) {
		if (!vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = getUser<string>(configKey);
		if (javaConfig.embeddedJreVer) {
			if (originPath) {
				remove(configKey);
			}
			return;
		}
		const fixedOrDefault = stableLtsRuntime?.path || await jdkExplorer.fixPath(originPath);
		if (fixedOrDefault && fixedOrDefault !== originPath) { // Keep if undefined (= invalid path)
			update(configKey, fixedOrDefault);
		}
	}
	_useEmbeddedJre('redhat.java', 'java.jdt.ls.java.home');
	_useEmbeddedJre('vmware.vscode-spring-boot', 'spring-boot.ls.java.home');

	//-------------------------------------------------------------------------
	// Optional Extensions LS Java Home (Keep if set)
	async function _updateOptionJavaHome(extensionId: string, configKey: string,
		optionalRuntime: redhat.IJavaRuntime | undefined)
	{
		if (!optionalRuntime || !vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = getUser<string>(configKey);
		if (originPath) {
			let fixedOrDefault = optionalRuntime.path;
			if (system.isUserInstalled(originPath)) {
				fixedOrDefault = await jdkExplorer.fixPath(originPath) || fixedOrDefault;
			}
			if (fixedOrDefault !== originPath) {
				update(configKey, fixedOrDefault);
			}
		} else { // If unset use default
			update(configKey, optionalRuntime.path);
		}
	}
	const prevLtsRuntime = runtimes.findByVersion(javaConfig.downloadLtsVers.at(-2)); // Undefined if not exists
	_updateOptionJavaHome('ibm.zopeneditor', 'zopeneditor.JAVA_HOME', prevLtsRuntime);
	_updateOptionJavaHome('scalameta.metals', 'metals.javaHome', prevLtsRuntime);
	_updateOptionJavaHome('redhat.vscode-rsp-ui', 'rsp-ui.rsp.java.home', stableLtsRuntime);
	_updateOptionJavaHome('salesforce.salesforcedx-vscode', 'salesforcedx-vscode-apex.java.home', prevLtsRuntime);
	// Sonarlint: Uses embedded JRE
	// Liberty Tools for Visual Studio Code: Uses java.jdt.ls.java.home > Red Hat embedded JRE

	//-------------------------------------------------------------------------
	// Optional Extensions java executable path (Keep if set)
	if (stableLtsRuntime && vscode.extensions.getExtension('jebbs.plantuml')) {
		const CONFIG_KEY_PLANTUML_JAVA = 'plantuml.java';
		const originPath = getUser<string>(CONFIG_KEY_PLANTUML_JAVA);
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
	if (getUserDef(section) === undefined) {
		update(section, value);
	}
}

/**
 * Sets default values for VS Code settings.
 * @param javaConfig The Java configuration.
 */
export async function setDefault(javaConfig: redhat.IJavaConfig) {

	// Workaround: Uninstall extension that cause configuration errors
	// Closed) https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/503
	// Open) https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/665
	const redhatDependExId = 'redhat.fabric8-analytics';
	if (vscode.extensions.getExtension(redhatDependExId)) {
		if (!await jdkExplorer.isValidHome(process.env.JAVA_HOME) ||
			(!getUser('redHatDependencyAnalytics.mvn.executable.path') && !(await system.whichPath('mvn')))
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
	// Included extensions
	setIfUndefined('cSpell.diagnosticLevel', 'Hint', 'streetsidesoftware.code-spell-checker');
	setIfUndefined('trailing-spaces.backgroundColor', 'rgba(255,0,0,0.1)', 'shardulm94.trailing-spaces');
	setIfUndefined('trailing-spaces.includeEmptyLines', false, 'shardulm94.trailing-spaces');
	// Optional extensions
	setIfUndefined('thunder-client.requestLayout', 'Top/Bottom', 'rangav.vscode-thunder-client');
	// VS Code Terminal
	setIfUndefined('terminal.integrated.tabs.hideCondition', 'never');
	setIfUndefined('terminal.integrated.enablePersistentSessions', false);
	// Java extensions
	setIfUndefined('java.debug.settings.hotCodeReplace', 'auto');
	setIfUndefined('java.sources.organizeImports.staticStarThreshold', 1);
	setIfUndefined('java.configuration.detectJdksAtStart', false);
	setIfUndefined('java.configuration.updateBuildConfiguration', 'automatic');
}
