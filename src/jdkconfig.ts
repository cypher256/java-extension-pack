/**
 * Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as _ from "lodash";
import * as jdkscan from './jdkscan';
import * as jdkauto from './jdkauto';
const log = jdkauto.log;

/**
 * Updates the Java runtime configurations for the VSCode Java extension.
 * @param runtimes An array of Java runtime objects to update the configuration with.
 * @param runtimesOld An array of previous Java runtime objects to compare with `runtimes`.
 * @param latestLtsVersion The latest LTS version.
 */
export async function update(
	runtimes:jdkauto.IConfigRuntime[], 
	runtimesOld:jdkauto.IConfigRuntime[],
	latestLtsVersion:number) {

	const config = vscode.workspace.getConfiguration();
	const updateConfig = (section:string, value:any) => {
		config.update(section, value, vscode.ConfigurationTarget.Global);
		log.info('Updated config:', section, _.isString(value) ? value : '');
	};
	const CONFIG_KEY_DEPRECATED_JAVA_HOME = 'java.home';
	if (config.get(CONFIG_KEY_DEPRECATED_JAVA_HOME) !== null) {
		updateConfig(CONFIG_KEY_DEPRECATED_JAVA_HOME, undefined);
	}

	// VSCode LS Java Home (Fix if unsupported old version)
	const latestLtsRuntime = runtimes.find(r => r.name === jdkauto.runtime.nameOf(latestLtsVersion));
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
						updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Fix unsupported old version
					} else if (fixedPath !== originPath) {
						updateConfig(CONFIG_KEY_LS_JAVA_HOME, fixedPath); // Fix invalid
					} else {
						// Keep new version
					}
				} else {
					updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // Can't fix
				}
			} else {
				updateConfig(CONFIG_KEY_LS_JAVA_HOME, latestLtsPath); // if unset
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
		updateConfig(jdkauto.runtime.CONFIG_KEY, runtimes);
	}

	// Gradle Daemon Java Home (Fix if set), Note: If unset use java.jdt.ls.java.home
	const defaultRuntime = runtimes.find(r => r.default);
	if (defaultRuntime) {
		const CONFIG_KEY_GRADLE_JAVA_HOME = 'java.import.gradle.java.home';
		const originPath = config.get<string>(CONFIG_KEY_GRADLE_JAVA_HOME);
		if (originPath) {
			const fixedPath = await jdkscan.fixPath(originPath, defaultRuntime.path);
			if (fixedPath && fixedPath !== originPath) {
				updateConfig(CONFIG_KEY_GRADLE_JAVA_HOME, fixedPath);
			}
		} else {
			updateConfig(CONFIG_KEY_GRADLE_JAVA_HOME, defaultRuntime.path);
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
			updateConfig(CONFIG_KEY_MAVEN_CUSTOM_ENV, customEnv);
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
		env.PATH = javaHome + (jdkauto.isWindows ? '\\bin;' : '/bin:') + '${env:PATH}';
		if (jdkauto.isMac) {
			env.ZDOTDIR ??= jdkauto.getGlobalStoragePath(); // Disable .zshrc JAVA_HOME
		}
	};
	const osConfigName = jdkauto.isWindows ? 'windows' : jdkauto.isMac ? 'osx' : 'linux';
	if (defaultRuntime) {
		const CONFIG_KEY_TERMINAL_ENV = 'terminal.integrated.env.' + osConfigName;
		const terminalDefault:any = config.get(CONFIG_KEY_TERMINAL_ENV, {});
		const updateTerminalConfig = (newPath: string) => {
			setTerminalEnv(newPath, terminalDefault);
			updateConfig(CONFIG_KEY_TERMINAL_ENV, terminalDefault);
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
		.filter(([key, profile]) => !jdkauto.runtime.versionOf(key))); // Copy unmanaged profile

	for (const runtime of runtimes) {
		const profile:any = _.cloneDeep(profilesOld[runtime.name]) ?? {}; // for isEqual
		profile.overrideName = true;
		if (jdkauto.isWindows) {
			profile.path ??= 'powershell';
		} else {
			profile.path ??= jdkauto.isMac ? 'zsh' : 'bash';
			profile.args ??= ['-l'];
		}
		profile.env ??= {};
		setTerminalEnv(runtime.path, profile.env);
		profilesNew[runtime.name] = profile;
	}
	if (!_.isEqual(profilesNew, profilesOld) ) {
		updateConfig(CONFIG_KEY_TERMINAL_PROFILES, profilesNew);
		// Don't set 'terminal.integrated.defaultProfile.*' because Terminal Default is set
	}
}
