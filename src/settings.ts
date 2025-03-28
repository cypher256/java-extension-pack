/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as jdkutils from 'jdk-utils';
import * as _ from "lodash";
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as gradle from './download/gradle';
import * as jdk from './download/jdk';
import * as maven from './download/maven';
import * as jdkExplorer from './jdkExplorer';
import * as redhat from './redhat';
import { SettingState } from './SettingState';
import * as system from './system';
import { OS, log } from './system';
export const AUTO_CONFIG_ENABLED = 'javaAutoConfig.enabled';

/**
 * Return a value from user/remote settings.json or default configuration.
 * @param section Configuration name, supports _dotted_ names.
 * @returns The value `section` denotes or `undefined`. null is a valid value.
 */
export function getUserOrDefault<T>(section: string): T | undefined {
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
export function getUserDefine<T>(section: string): T | undefined {
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
export async function update(section: string, value: any) {
	const config = vscode.workspace.getConfiguration();
	value = Array.isArray(value) && value.length === 0 ? undefined : value;
	log.info(`${value ? 'Update' : 'Remove'} Settings:`, section, _.isObject(value) ? '' : value);
	return await config.update(section, value, vscode.ConfigurationTarget.Global);
}

/**
 * Removes a VS Code user/remote settings entry.
 * @param section Configuration name, supports _dotted_ names.
 * @returns A promise that resolves when the configuration is removed.
 */
export async function remove(section: string) {
	return await update(section, undefined);
}

/**
 * Gets the Java runtime configurations for the VS Code Java extension.
 * @returns An array of Java runtime objects. If no entry exists, returns an empty array.
 */
export function getJavaConfigRuntimes(): redhat.JavaConfigRuntimes {
	const redhatRuntimes: redhat.IJavaConfigRuntime[] = getUserOrDefault(redhat.JavaConfigRuntimes.CONFIG_NAME) ?? [];
	return new redhat.JavaConfigRuntimes(...redhatRuntimes);
}

/**
 * Profile utility namespace.
 */
export namespace Profile {

	export const CONFIG_NAME_TERMINAL_DEFAULT_PROFILE = 'terminal.integrated.defaultProfile.' + OS.configName;
	export const CONFIG_NAME_TERMINAL_PROFILES = 'terminal.integrated.profiles.' + OS.configName;

	export const nameOf = (runtimeName: string) =>
		runtimeName + (redhat.isLtsVersion(redhat.versionOf(runtimeName)) ? ' LTS' : '')
		;
	export const toRuntimeName = (profileName: string) =>
		profileName.replace(/ LTS$/, '')
		;
	export const toVersion = (profileName: string) =>
		isGeneratedRuntime(profileName) ? redhat.versionOf(toRuntimeName(profileName)) : undefined;
	;
	export const getUserDefProfileVersion = () =>
		toVersion(getUserDefine(CONFIG_NAME_TERMINAL_DEFAULT_PROFILE) || '')
		;
	export const isGeneratedRuntime = (profileName: string) =>
		/^J(2|ava)SE-[\d.]+( LTS|)$/.test(profileName) // Strict names
		;
	export const isJavaPrefix = (profileName: string) =>
		/^J(2|ava)SE/.test(profileName) // Includes custom names by user
		;
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
	runtimes: redhat.JavaConfigRuntimes,
	runtimesOld: redhat.JavaConfigRuntimes) {

	const CONFIG_NAME_DEPRECATED_JAVA_HOME = 'java.home';
	if (getUserDefine(CONFIG_NAME_DEPRECATED_JAVA_HOME) !== undefined) {
		remove(CONFIG_NAME_DEPRECATED_JAVA_HOME);
	}

	const profileRuntimeToApply = (() => {
		const state = SettingState.getInstance();
		if (state.isDefaultProfileApplying) {
			state.isDefaultProfileApplying = false;
			const defaultProfileVer = Profile.getUserDefProfileVersion();
			log.info(`Apply Default Profile Java ${defaultProfileVer}`);
			return runtimes.findByVersion(defaultProfileVer);
		}
		return undefined;
	})();
	const stableLtsRuntime = runtimes.findByVersion(javaConfig.stableLtsVer);
	const latestLtsRuntime = runtimes.findByVersion(javaConfig.latestLtsVer);

	// Project Runtimes Default
	if (profileRuntimeToApply) {
		runtimes.forEach(runtime => runtime.default = undefined); // Clear
		profileRuntimeToApply.default = true;
	} else if (runtimes.findDefault()) {
		// Keep
	} else {
		// Set default if the latest available exists
		const previewableRuntime = runtimes.findByVersion(javaConfig.latestAvailableVer);
		if (previewableRuntime) {
			previewableRuntime.default = true; // Preview available only for latest and default
		}
		// else No default (JAVA_HOME env var is used)
		// Do not set anything other than the latest because it is called before downloading.
	}
	runtimes.sort((a, b) => a.name.localeCompare(b.name));
	if (!_.isEqual(runtimes, runtimesOld)) {
		update(redhat.JavaConfigRuntimes.CONFIG_NAME, runtimes);
	}

	async function _fixJavaHome(currentJavaHome: string, defaultRuntime: redhat.IJavaConfigRuntime): Promise<string> {
		if (profileRuntimeToApply?.path) {
			return profileRuntimeToApply.path;
		}
		const fixedPath = await jdkExplorer.fixPath(currentJavaHome);
		if (fixedPath) {
			if (javaConfig.latestVerPath && system.equalsPath(fixedPath, jdk.getDownloadLatestDir())) {
				return javaConfig.latestVerPath;
			}
			return fixedPath;
		}
		return defaultRuntime.path;
	}

	//-------------------------------------------------------------------------
	// Terminal Profiles Dropdown
	const defProfiles = getUserDefine(Profile.CONFIG_NAME_TERMINAL_PROFILES) ?? {};
	const oldProfiles: any = _.cloneDeep(defProfiles); // Proxy to POJO for isEqual
	const newProfiles: any = _.cloneDeep(oldProfiles);
	const _appendEnvPath = (javaHome: string) => [path.join(javaHome, 'bin'), '${env:PATH}'].join(path.delimiter);
	const rcfileDir = system.getGlobalStoragePath();

	for (const runtime of runtimes) {
		const ver = redhat.versionOf(runtime.name);
		const profileName = Profile.nameOf(runtime.name);

		// Create from config runtimes (Always overwrite), Proxy to POJO for isEqual
		const profile: any = _.cloneDeep(newProfiles[profileName]) ?? {};
		newProfiles[profileName] = profile;
		profile.overrideName = true;
		profile.env = {};
		if (OS.isWindows) {
			profile.path = 'cmd'; // powershell (legacy), pwsh (non-preinstalled)
			profile.env.PATH = _appendEnvPath(runtime.path);
			if (ver >= 19) {

				// Support JEP 400 UTF-8 Default (Java 18+)
				// Unsupported System.in UTF-8: https://bugs.openjdk.org/browse/JDK-8295672
				// Note: automationProfile is required to prevent errors when specifying defaultProfile
				profile.args = ["/k", "chcp", "65001"];

				// For Terminal Command Build (Java 19+ and chcp 65001)
				profile.env.JAVA_TOOL_OPTIONS = '-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8';
				// JAVA_TOOL_OPTIONS doesn't work in Gradle task UI (Specify in build.gradle instead)
				// [build.gradle] applicationDefaultJvmArgs = ['-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8']
				// Open) https://github.com/microsoft/vscode-gradle/issues/1480
				// Not working
				// "java.import.gradle.arguments"   : "-DJAVA_TOOL_OPTIONS=-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8",
				// "java.import.gradle.jvmArguments": "-DJAVA_TOOL_OPTIONS=-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8",

				// Gradle: Set applicationDefaultJvmArgs default for Task UI and cmd
				// Open) https://github.com/gradle/gradle/issues/28959
			}
		} else if (OS.isMac) {
			profile.path = 'zsh';
			if (!process.env.ZDOTDIR) {
				profile.env.ZDOTDIR = rcfileDir;
			}
		} else { // Linux
			profile.path = 'bash';
			profile.args = ['--rcfile', path.join(rcfileDir, '.bashrc')];
			// Do not use --login because disables --rcfile
		}
		profile.env.JAVA_HOME = runtime.path;
	}
	for (const profileName of Object.keys(newProfiles)) {
		// Remove profiles that do not exist in runtimes
		if (Profile.isGeneratedRuntime(profileName) && !runtimes.findByName(Profile.toRuntimeName(profileName))) {
			delete newProfiles[profileName];
		}
	}
	const terminalDefaultRuntime = latestLtsRuntime || stableLtsRuntime;
	if (terminalDefaultRuntime) {
		// Create or update default zsh/bash profiles
		// On Mac/Linux, npm error occurs if rcfile is disabled
		const _setDefaultProfile = async (shellName: string) => {
			const profile = newProfiles[shellName] || {};
			profile.path = shellName;
			profile.env ||= {};
			profile.env.JAVA_HOME = await _fixJavaHome(profile.env.JAVA_HOME, terminalDefaultRuntime);
			newProfiles[shellName] = profile;
			return profile;
		};
		if (OS.isMac) {
			const profile = await _setDefaultProfile('zsh'); // Inherited -l from default profile
			if (!process.env.ZDOTDIR) {
				profile.env.ZDOTDIR = rcfileDir;
			}
		} else if (OS.isLinux) {
			const profile = await _setDefaultProfile('bash');
			profile.args = ['--rcfile', path.join(rcfileDir, '.bashrc')];
		}
	}
	const profileNames = Object.keys(newProfiles);
	const sortedNames = [
		..._.reject(profileNames, Profile.isJavaPrefix), // Keep order
		..._.filter(profileNames, Profile.isJavaPrefix).sort(),
	];
	const sortedProfiles = Object.fromEntries(sortedNames.map(name => [name, newProfiles[name]]));
	if (!_.isEqual(sortedNames, profileNames) || !_.isEqual(sortedProfiles, oldProfiles)) {
		await update(Profile.CONFIG_NAME_TERMINAL_PROFILES, sortedProfiles);
		// await for following defaultProfile update
	}
	if (OS.isWindows) {
		// Suppress error 'Incorrect parameter format -/d' when using defaultProfile & args chcp
		// Resolved) https://github.com/microsoft/vscode/issues/202691
		const CONFIG_NAME_AUTO_PROFILE = 'terminal.integrated.automationProfile.windows';
		const newValue = { "path": "cmd" };
		const oldValue = _.cloneDeep(getUserOrDefault(CONFIG_NAME_AUTO_PROFILE));
		if (!_.isEqual(newValue, oldValue)) {
			update(CONFIG_NAME_AUTO_PROFILE, newValue); // Note the order of entries in settings.json
		}
		// Not working "env"
		// Open) https://github.com/microsoft/vscode-makefile-tools/issues/493
	}

	//-------------------------------------------------------------------------
	// Default Profile
	const defaultProfileRuntime = runtimes.findDefault() || latestLtsRuntime || stableLtsRuntime;
	if (defaultProfileRuntime) {
		// [Windows/Mac/Linux] Default profile
		// Linux Maven uses the Java version of the default profile rcfile
		const newDefaultProfile = Profile.nameOf(defaultProfileRuntime.name);
		const profiles: any = getUserOrDefault(Profile.CONFIG_NAME_TERMINAL_PROFILES);
		if (profiles?.[newDefaultProfile]) {
			const oldDefaultProfile = getUserDefine<string>(Profile.CONFIG_NAME_TERMINAL_DEFAULT_PROFILE);
			if (oldDefaultProfile) {
				// Repair: Non-existing profile name (getUser: Includes PowerShell, pwsh, zsh, bash, etc...)
				if (!profiles[oldDefaultProfile]) {
					update(Profile.CONFIG_NAME_TERMINAL_DEFAULT_PROFILE, newDefaultProfile);
				}
				// else Keep
			} else {
				// New
				update(Profile.CONFIG_NAME_TERMINAL_DEFAULT_PROFILE, newDefaultProfile);
			}
		}
	}

	//-------------------------------------------------------------------------
	// Test Debug Console Encoding (Ignored before Java 18)
	if (OS.isWindows) {
		const CONFIG_NAME_TEST_CONFIG = 'java.test.config';
		const testConfig: any = _.cloneDeep(getUserOrDefault(CONFIG_NAME_TEST_CONFIG) ?? {});
		const testConfigOld = _.cloneDeep(testConfig);
		const vmArgs: string[] = testConfig.vmArgs || [];

		function _addArg(dest: string) {
			const argName = `-D${dest}.encoding=`;
			if (!vmArgs.find(e => e.startsWith(argName))) {
				vmArgs.push(argName + 'UTF-8');
			}
		}
		_addArg('stdout');
		_addArg('stderr');
		testConfig.vmArgs = vmArgs;
		if (!_.isEqual(testConfig, testConfigOld)) {
			update(CONFIG_NAME_TEST_CONFIG, testConfig);
		}
	}

	//-------------------------------------------------------------------------
	// Terminal Default Env Variables (Keep if set)
	if (terminalDefaultRuntime) {
		// [Windows] Default cmd/powershell (gitbash not supported)
		// Run/Debug is launched using project's java.exe for No-build-tools/maven/gradle
		// PRECEDENCE: Env Gradle/Maven > terminal.integrated.env JAVA_HOME > original PATH
		if (OS.isWindows) {
			const CONFIG_NAME_TERMINAL_ENV = 'terminal.integrated.env.' + OS.configName;
			const terminalEnv: any = _.cloneDeep(getUserOrDefault(CONFIG_NAME_TERMINAL_ENV) ?? {}); // Proxy to POJO for isEqual
			const terminalEnvOld = _.cloneDeep(terminalEnv);
			terminalEnv.JAVA_HOME = await _fixJavaHome(terminalEnv.JAVA_HOME, terminalDefaultRuntime);
			terminalEnv.PATH = _appendEnvPath(terminalEnv.JAVA_HOME);
			// It also applies to "Run | Debug" on Windows Encoding, so specify it in profiles
			//terminalEnv.JAVA_TOOL_OPTIONS = '-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8';
			if (!_.isEqual(terminalEnv, terminalEnvOld)) {
				update(CONFIG_NAME_TERMINAL_ENV, terminalEnv);
			}
		}
		// [Mac/Linux] Use custom rcfile in zsh/bash
		// PRECEDENCE: profile JAVA_HOME > Env Gradle/Maven > original PATH
	}

	//-------------------------------------------------------------------------
	// Maven Terminal Custom Env (Keep if set)
	const mavenJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (mavenJavaRuntime && maven.hasExtension()) {
		const CONFIG_NAME_MAVEN_CUSTOM_ENV = 'maven.terminal.customEnv';
		const customEnv: any[] = _.cloneDeep(getUserOrDefault(CONFIG_NAME_MAVEN_CUSTOM_ENV) ?? []);
		const customEnvOld = _.cloneDeep(customEnv);
		function _getCustomEnv(envName: string): { value: string } {
			let element = customEnv.find(i => i.environmentVariable === envName);
			if (!element) {
				element = { environmentVariable: envName };
				customEnv.push(element);
			}
			return element;
		}

		// [Windows]     PRECEDENCE: Env Gradle/Maven > customEnv > terminal.integrated.env > original PATH
		// [Mac/Linux] PRECEDENCE: customEnv > .*shrc JAVA_HOME > Env Gradle/Maven > original PATH
		// Issue: Option to use specific Java SDK to run Maven
		//   Open) https://github.com/microsoft/vscode-maven/issues/992
		// Issue: Change the scope of maven.terminal.customEnv to machine-overridable
		//   Open) https://github.com/microsoft/vscode-maven/issues/991
		const javaHomeEnv = _getCustomEnv('JAVA_HOME');
		javaHomeEnv.value = await _fixJavaHome(javaHomeEnv.value, mavenJavaRuntime);

		// [Windows] maven and gradle don't need java/bin in PATH (java command cannot be executed)
		// [Linux/Mac] PATH is not required because defaultProfile's rcfile is used
		_.remove(customEnv, { environmentVariable: 'PATH' }); // Remove for previous version
		/*
		if (OS.isWindows) {
			// [Windows] PATH: for java command (mvn and gradle work without java/bin in PATH)
			_getCustomEnv('PATH').value = _createPathPrepend(javaHomeEnv.value);
		} else {
			// [Linux/Mac] PATH: Remove when switching from Windows to WSL
			_.remove(customEnv, {environmentVariable: 'PATH'});
		}
		*/

		// [Mac] Use custom rcfile in zsh
		// Issue: maven.terminal.useJavaHome doesnt work if JAVA_HOME already set by shell startup scripts
		// Open) https://github.com/microsoft/vscode-maven/issues/495#issuecomment-1869653082
		if (OS.isMac && !process.env.ZDOTDIR) {
			_getCustomEnv('ZDOTDIR').value = rcfileDir;
		}

		if (!_.isEqual(customEnv, customEnvOld)) {
			update(CONFIG_NAME_MAVEN_CUSTOM_ENV, customEnv);
		}
	}

	//-------------------------------------------------------------------------
	// Gradle Daemon Java Home (Keep if set): Output > Gradle for Java > Java Home
	// Gradle 8.5+ can execute on latest Java versions
	// Resolved) https://github.com/gradle/gradle/issues/26944#issuecomment-1794419074
	const gradleJavaRuntime = latestLtsRuntime || stableLtsRuntime;
	if (gradleJavaRuntime && gradle.hasExtension()) {
		const CONFIG_NAME_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = getUserOrDefault<string>(CONFIG_NAME_GRADLE_JAVA_HOME);
		function _updateGradleJavaHome(newPath: string) {
			update(CONFIG_NAME_GRADLE_JAVA_HOME, newPath);
			/* Comment Out: Gradle extension shows reload dialog
			if (!profileRuntimeToApply) {
				javaConfig.needsReload = true;
				log.info(`Needs Reload: Restart Gradle Daemon\n${originPath}\n${newPath}`);
			}
			*/
		}
		if (originPath) {
			const fixedOrDefault = await _fixJavaHome(originPath, gradleJavaRuntime);
			if (fixedOrDefault !== originPath) {
				_updateGradleJavaHome(fixedOrDefault);
			}
		} else { // If unset use default
			_updateGradleJavaHome(gradleJavaRuntime.path);
		}
		// Pending: org.gradle.java.installations.paths
		// Open) https://github.com/redhat-developer/vscode-java/issues/2804
		// Open) https://github.com/microsoft/vscode-gradle/issues/1330
	}

	//-------------------------------------------------------------------------
	// VS Code LS Java Home
	async function _useEmbeddedJre(extensionId: string, configKey: string) {
		if (!vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = getUserOrDefault<string>(configKey);
		// Remove if embedded JRE exists
		/*
		// 2024-10-31: Do not remove for javac-based compile support
		// https://github.com/redhat-developer/vscode-java/pull/3558
		if (javaConfig.embeddedJreVer) {
			if (originPath) {
				remove(configKey);
			}
			return;
		}
		const fixedOrDefault = stableLtsRuntime?.path || await jdkExplorer.fixPath(originPath);
		*/
		const fixedOrDefault = await jdkExplorer.fixPath(originPath);
		if (fixedOrDefault && fixedOrDefault !== originPath) { // Keep if undefined (= invalid path)
			update(configKey, fixedOrDefault);
			// Comment Out: Gradle extension shows reload dialog
			//javaConfig.needsReload = true;
		}
	}
	_useEmbeddedJre('redhat.java', 'java.jdt.ls.java.home');
	_useEmbeddedJre('vmware.vscode-spring-boot', 'spring-boot.ls.java.home');

	//-------------------------------------------------------------------------
	// Optional Extensions LS Java Home (Keep if set)
	async function _updateOptionJavaHome(extensionId: string, configKey: string,
		optionalRuntime?: redhat.IJavaConfigRuntime) {
		if (!optionalRuntime || !vscode.extensions.getExtension(extensionId)) {
			return;
		}
		const originPath = getUserOrDefault<string>(configKey);
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
		const CONFIG_NAME_PLANTUML_JAVA = 'plantuml.java';
		const originPath = getUserOrDefault<string>(CONFIG_NAME_PLANTUML_JAVA);
		if (!originPath || !system.existsFile(originPath)) {
			const newPath = path.join(stableLtsRuntime.path, 'bin', jdkutils.JAVA_FILENAME);
			update(CONFIG_NAME_PLANTUML_JAVA, newPath);
		}
	}
}

function setIfUndefined(section: string, value: any, extensionId?: string) {
	if (extensionId && !vscode.extensions.getExtension(extensionId)) {
		return;
	}
	if (value !== undefined && getUserDefine(section) === undefined) {
		update(section, value);
	}
}

/**
 * Sets default values for VS Code settings.
 * @param javaConfig The Java configuration.
 */
export async function setDefault(javaConfig: redhat.IJavaConfig) {

	if (!javaConfig.isFirstStartup) {
		return;
	}

	// Workaround: Uninstall extension that cause configuration errors
	// Closed) https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/503
	// Open) https://github.com/fabric8-analytics/fabric8-analytics-vscode-extension/issues/665
	const redhatDependExId = 'redhat.fabric8-analytics';
	if (vscode.extensions.getExtension(redhatDependExId)) {
		if (!await jdkExplorer.isValidHome(process.env.JAVA_HOME) ||
			(!getUserOrDefault('redHatDependencyAnalytics.mvn.executable.path') && !(await system.whichPath('mvn')))
		) {
			log.warn('Needs Reload: Uninstall extension', redhatDependExId);
			vscode.commands.executeCommand('workbench.extensions.uninstallExtension', redhatDependExId);
			javaConfig.needsReload = true;
		}
	}

	// VS Code Editor
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
	// Deprecated: Order differs from other IDEs, removed when writing imports in TS
	// setIfUndefined('editor.codeActionsOnSave', {
	// 	"source.organizeImports": 'explicit'
	// });

	// VS Code Workbench
	setIfUndefined('workbench.colorCustomizations', {
		"[Default Dark Modern]": {
			"tab.activeBorderTop": "#00FF00",
			"tab.unfocusedActiveBorderTop": "#00FF0088",
			"textCodeBlock.background": "#00000055", // Markdown preview code block
		},
		"editor.wordHighlightStrongBorder": "#FF6347",
		"editor.wordHighlightBorder": "#FFD700",
		"editor.selectionHighlightBorder": "#A9A9A9",
	});
	setIfUndefined('workbench.editor.revealIfOpen', true);
	if (OS.isWindows) {
		setIfUndefined('files.eol', '\n');
		setIfUndefined('[bat]', { 'files.eol': '\r\n' });
	}

	// VS Code Emmet
	setIfUndefined('emmet.variables', { 'lang': OS.locale.substring(0, 2) });

	// Optional extensions
	setIfUndefined('emmet.includeLanguages', { "jsp": "html" }, 'samuel-weinhardt.vscode-jsp-lang');
	setIfUndefined('thunder-client.requestLayout', 'Top/Bottom', 'rangav.vscode-thunder-client');
	if (vscode.extensions.getExtension('sohamkamani.code-eol')) {
		// code-eol: License unknown, default color is theme text color
		setIfUndefined('code-eol.color', '#8888');
	}
	if (vscode.extensions.getExtension('jeff-hykin.code-eol') && OS.locale.startsWith('ja')) {
		// code-eol 2022: License MIT, default color is theme whitespace color
		setIfUndefined("code-eol.style", { "color": "#8888" });
		setIfUndefined("code-eol.crlfCharacter", "↵");
		setIfUndefined("code-eol.returnCharacter", "←");
		setIfUndefined("code-eol.newlineCharacter", "↓");
	}

	// Included extensions
	setIfUndefined('cSpell.diagnosticLevel', 'Hint', 'streetsidesoftware.code-spell-checker');
	setIfUndefined('trailing-spaces.backgroundColor', 'rgba(255,0,0,0.1)', 'shardulm94.trailing-spaces');
	setIfUndefined('trailing-spaces.includeEmptyLines', false, 'shardulm94.trailing-spaces');

	// VS Code Terminal
	setIfUndefined('terminal.integrated.tabs.hideCondition', 'never');
	setIfUndefined('terminal.integrated.enablePersistentSessions', false);

	// Java extensions
	setIfUndefined('java.compile.nullAnalysis.mode', 'automatic');
	setIfUndefined('java.configuration.detectJdksAtStart', false);
	setIfUndefined('java.configuration.updateBuildConfiguration', 'automatic');
	setIfUndefined('java.debug.settings.hotCodeReplace', 'auto');
	setIfUndefined('java.dependency.packagePresentation', 'hierarchical');
	setIfUndefined('java.maxConcurrentBuilds', os.cpus().length || undefined);
	setIfUndefined('java.sources.organizeImports.staticStarThreshold', 1);
}
