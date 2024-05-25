/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as fs from 'fs';
import * as _ from "lodash";
import * as path from 'path';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as gradle from './download/gradle';
import * as jdk from './download/jdk';
import * as maven from './download/maven';
import * as jdkExplorer from './jdkExplorer';
import * as redhat from './redhat';
import * as settings from './settings';
import * as system from './system';
import { OS, log } from './system';

/**
 * Activates the extension.
 * @param context The extension context.
 * @returns A promise that resolves when the extension is activated.
 */
export async function activate(context:vscode.ExtensionContext) {
	try {
		const isFirstStartup = system.init(context);
		log.info(`activate START ${context.extension?.packageJSON?.version} --------------------`);
		log.info('Global Storage', system.getGlobalStoragePath());
		copyRcfile();
		setTerminalEnvironment();

		const AUTO_CONFIG_ENABLED = 'javaAutoConfig.enabled';
		if (!settings.getWorkspace(AUTO_CONFIG_ENABLED)) {
			log.info(`${AUTO_CONFIG_ENABLED}: false`);
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration(AUTO_CONFIG_ENABLED)
					&& settings.getWorkspace(AUTO_CONFIG_ENABLED) === true
				) {
					showReloadMessage();
				}
			});
			return;
		}
		const javaConfig = await redhat.getJavaConfig();
		settings.setDefault(javaConfig);

		const runtimes = settings.getJavaRuntimes();
		const runtimesOld = _.cloneDeep(runtimes);
		await detect(javaConfig, runtimes);
		await download(javaConfig, runtimes);
		onComplete(javaConfig, runtimes, runtimesOld, isFirstStartup);
		setTerminalEnvironment();

	} catch (e:any) {
		vscode.window.showErrorMessage(`Auto Config Java failed. ${e}`);
		log.error(e);
		
	} finally {
		log.info('activate END');
	}
}

/**
 * Copies the rcfile files.
 */
function copyRcfile() {
	if (OS.isWindows) {
		return;
	}
	// Copy the resources directory as its path will change when updating the version
	const resourcesDir = system.getExtensionContext().asAbsolutePath('resources');
	function _copy(fileName:string) {
		const src = system.readString(path.join(resourcesDir, fileName));
		const dst = system.readString(system.getGlobalStoragePath(fileName));
		if (src && src !== dst) {
			fs.writeFile(system.getGlobalStoragePath(fileName), src, (error) => {
				if (error) {log.warn('Failed copy rcfile', error);}
			});
		}
	}
	_copy('.zshrc');
	_copy('.bashrc');
}

/**
 * Sets the terminal environment variables.
 */
async function setTerminalEnvironment() {

	// Maven configuration is workspace not yet supported
	// https://github.com/microsoft/vscode-maven/issues/991#issuecomment-1940414022
	const mavenBinDir = await maven.getWorkspaceBinDir();
	const gradleBinDir = await gradle.getWorkspaceBinDir();
	const toolsPath = [gradleBinDir, mavenBinDir].filter(Boolean).join(path.delimiter);
	if (!toolsPath) {
		return;
	}

	// Set env var by workspace folder
	const globalEnv = system.getExtensionContext().environmentVariableCollection;
	const folderEnvs = vscode.workspace.workspaceFolders?.map(f => globalEnv.getScoped({workspaceFolder:f})) ?? [];

	for (const envVarColl of folderEnvs.concat(globalEnv)) {
		envVarColl.clear(); // Clear persisted values (Not cleared on restart)

		// Terminal all profiles common PATH prefix
		if (OS.isWindows) {
			// [Windows]
			// PRECEDENCE: Env Gradle/Maven > profile JAVA_HOME > original PATH
			envVarColl.prepend('PATH', toolsPath + path.delimiter);
		} else {
			// [macOS/Linux] Use custom rcfile in zsh/bash
			// PRECEDENCE: profile JAVA_HOME > Env Gradle/Maven > original PATH
			// Issue: PATH mutation using EnvironmentVariableCollection prepend is overwritten in zsh
			// Open) https://github.com/microsoft/vscode/issues/188235
			envVarColl.replace('AUTO_CONFIG_PATH', toolsPath);
		}

		// Pending: Gradle Toolchains env var for Terminal (Because not working Gradle Task UI)
		//envVarColl.replace('ORG_GRADLE_PROJECT_org.gradle.java.installations.paths', 'D:\\pleiades\\2023-12\\java\\8,D:\\pleiades\\2023-12\\java\\11,D:\\pleiades\\2023-12\\java\\17,D:\\pleiades\\2023-12\\java\\21');

		// Pending: Gradle Toolchains for Task UI not working in settings.json:
		// * automationProfile > env -> https://github.com/microsoft/vscode/issues/140261
		// * "java.gradle.buildServer.enabled": "off"
		// * java.import.gradle.jvmArguments, arguments
		//   "-DJAVA_TOOL_OPTIONS=-DORG_GRADLE_PROJECT_org.gradle.java.installations.paths=D:\\pleiades\\2023-12\\java\\8,D:\\pleiades\\2023-12\\java\\11,D:\\pleiades\\2023-12\\java\\17,D:\\pleiades\\2023-09\\java\\21",

		// Pending: Set JAVA_HOME from workspace default runtime
		// Known Issue: JAVA_HOME is not reflected even if set (e.g. java.import.gradle.java.home)
		// Open) https://github.com/microsoft/vscode/issues/152806#issuecomment-1785065199
		// Open) https://github.com/microsoft/vscode-gradle/issues/1173
		//envVarColl.replace('JAVA_HOME', 'D:\\pleiades\\2023-06\\java\\17');
	}
}

/**
 * Detects the installed JDK and updates the Java runtimes.
 * @param javaConfig The Java configuration.
 * @param runtimes The Java runtimes to update.
 */
async function detect(
	javaConfig: redhat.IJavaConfig,
	runtimes: redhat.JavaRuntimeArray) {

	const runtimesBefore = _.cloneDeep(runtimes);
	await jdkExplorer.scan(javaConfig, runtimes);
	await settings.updateJavaRuntimes(javaConfig, runtimes, runtimesBefore);
}

/**
 * Downloads the JDK and updates the Java runtimes.
 * @param javaConfig The Java configuration.
 * @param runtimes The Java runtimes to update.
 */
async function download(
	javaConfig: redhat.IJavaConfig,
	runtimes: redhat.JavaRuntimeArray) {

	if (settings.getWorkspace('extensions.autoUpdate') === false) {
		log.info(`Download disabled (extensions.autoUpdate: false)`);
		return;
	}
	const downloadVers = [...javaConfig.downloadLtsVers, javaConfig.latestAvailableVer];
	const orderDescVers = _.uniq(downloadVers).sort((a,b) => b-a); // Reverse order
	if (!jdk.isTargetPlatform) {
		log.info(`Download disabled JDK (${process.platform}/${process.arch})`);
		orderDescVers.length = 0;
	}
	const runtimesBefore = _.cloneDeep(runtimes);
	const promises = [
		...orderDescVers.map(ver => jdk.download(javaConfig, runtimes, ver)),
		gradle.download(),
		maven.download(),
	];
	await Promise.allSettled(promises);
	await settings.updateJavaRuntimes(javaConfig, runtimes, runtimesBefore);
}

/**
 * Processes the completion of the extension activation.
 * @param javaConfig The Java configuration.
 * @param runtimesNew The Java runtimes after update.
 * @param runtimesOld The Java runtimes before update.
 * @param isFirstStartup Whether this is the first startup.
 */
function onComplete(
	javaConfig: redhat.IJavaConfig,
	runtimesNew: redhat.JavaRuntimeArray,
	runtimesOld: redhat.JavaRuntimeArray,
	isFirstStartup: boolean) {
	
	const oldVers = runtimesOld.map(r => redhat.versionOf(r.name));
	const newVers = runtimesNew.map(r => redhat.versionOf(r.name));
	const defaultVer = redhat.versionOf(runtimesNew.findDefault()?.name ?? '');
	log.info(`${redhat.JavaRuntimeArray.CONFIG_KEY} [${newVers}] default ${defaultVer}`);
	const availableMsg = `${l10n.t('Available Java versions:')} ${newVers.join(', ')}`;

	if (isFirstStartup) {
		vscode.window.showInformationMessage(availableMsg);
		const langPackSuffix = getLangPackSuffix();
		if (langPackSuffix) {
			installExtension('intellsmi.comment-translate');
			const langPackId = 'ms-ceintl.vscode-language-pack-' + langPackSuffix;
			if (!vscode.extensions.getExtension(langPackId)) {
				installExtension(langPackId); // Restart message
				setTimeout(showReloadMessage, 15_000); // Delay for above cancel
			} else if (vscode.env.language === 'en') {
				// Choose display language, restart modal dialog
				vscode.commands.executeCommand('workbench.action.configureLocale');
				setTimeout(showReloadMessage, 15_000); // Delay for cancel selected
			} else {
				showReloadMessage();
			}
		} else {
			showReloadMessage();
		}
	} else {
		const added = _.difference(newVers, oldVers);
		if (added.length > 0) {
			const msg = l10n.t('The following Java Runtime Configuration added. Version:');
			vscode.window.showInformationMessage(`${msg} ${added.join(', ')} (${availableMsg})`);
		} else {
			const removed = _.difference(oldVers, newVers);
			if (removed.length > 0) {
				const msg = l10n.t('The following Java Runtime Configuration removed. Version:');
				vscode.window.showInformationMessage(`${msg} ${removed.join(', ')} (${availableMsg})`);
				// Suppress errors when downgrading Red Hat extension
				javaConfig.needsReload = true;
			}
		}
		if (javaConfig.needsReload) {
			showReloadMessage();
		}
	}

	// Delay for prevent self update (2024.05.23 Testing 5_000 -> 0)
	setTimeout(() => setUpdateEvent(javaConfig), 0);
}

/**
 * @returns The language pack suffix. undefined if en or not detected.
 */
function getLangPackSuffix(): string | undefined {
	const osLocale = OS.locale;
	if (osLocale.match(/^(cs|de|es|fr|it|ja|ko|pl|ru|tr)/)) { // Only active language packs
		return osLocale.substring(0, 2);
	} else if (osLocale.startsWith('pt-br')) {
		return 'pt-BR'; // Portuguese (Brazil)
	} else if (osLocale.match(/^zh-(hk|tw)/)) {
		return 'zh-hant'; // Chinese (Traditional)
	} else if (osLocale.startsWith('zh')) {
		return 'zh-hans'; // Chinese (Simplified)
	}
	return undefined;
}

/**
 * Installs the extension.
 * @param extensionId The extension id.
 */
async function installExtension(extensionId:string) {
	try {
		await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
		log.info('Installed extension', extensionId);
	} catch (error) {
		log.info('Failed to install extension.', error); // Silent
	}
}

/**
 * Shows the reload message.
 */
function showReloadMessage() {
	const state = settings.SettingState.getInstance();
	if (state.message)  { return; }
	const message = l10n.t('Configuration changed, please Reload Window.');
	state.message = message;
	const reloadLabel = l10n.t('Reload');
	vscode.window.showWarningMessage(message, reloadLabel).then(selection => {
		state.message = undefined;
		if (selection === reloadLabel) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}

/**
 * Sets the update event.
 * @param javaConfig The Java configuration.
 */
function setUpdateEvent(javaConfig: redhat.IJavaConfig) {
	const state = settings.SettingState.getInstance();
	state.message = undefined;
	state.defaultProfileVer = settings.Profile.getDefaultProfileVersion();
	state.isEventProcessing = false;

	vscode.workspace.onDidChangeConfiguration(async event => {
		if (state.isEventProcessing) { return; }
		state.isEventProcessing = true;
		try {
			// Update Terminal PATH
			if (
				event.affectsConfiguration('java.import.gradle.home') ||
				event.affectsConfiguration('maven.executable.path')
			) {
				await setTerminalEnvironment();
				log.info('Complete Change Event: build tools path');
			}

			// Reconfigure Terminal Profiles
			else if (event.affectsConfiguration('java.configuration.runtimes')) {
				const runtimes = settings.getJavaRuntimes();
				await detect(javaConfig, runtimes); // Freeze without await
				log.info('Complete Change Event: java.configuration.runtimes');
			}

			// Change Default Profile
			else if (event.affectsConfiguration(settings.Profile.DEFAULT_PROFILE_CONFIG_KEY)) {
				const defaultProfileVer = settings.Profile.getDefaultProfileVersion();
				if (!defaultProfileVer || defaultProfileVer === state.defaultProfileVer) { 
					return;
				}
				state.defaultProfileVer = defaultProfileVer;
				const message = l10n.t(
					'The default profile Java version has changed. Do you want to apply it as default for user settings?'
				);
				if (message === state.message)  { return; }
				state.message = message;
				const cancelLabel = l10n.t('Cancel');
				const reloadLabel = l10n.t('Reload and apply');
				vscode.window.showWarningMessage(message, cancelLabel, reloadLabel).then(async selection => {
					state.message = undefined;
					if (selection === reloadLabel) {
						state.isApplyDefaultProfile = true;
						await state.store();
						vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				});
			}

		} catch (e:any) {
			log.error(e);

		} finally {
			// Waiting to suppress change events from a program
			setTimeout(() => {
				state.isEventProcessing = false;
				state.store();
			}, 5_000);
		}
	});
}
