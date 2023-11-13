/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as _ from "lodash";
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as autoContext from './autoContext';
import { OS, log } from './autoContext';
import * as gradle from './download/gradle';
import * as jdk from './download/jdk';
import * as maven from './download/maven';
import * as jdkExplorer from './jdkExplorer';
import * as jdtExtension from './jdtExtension';
import * as userSettings from './userSettings';

/**
 * Activates the extension.
 * @param context The extension context.
 * @return A promise that resolves when the extension is activated.
 */
export async function activate(context:vscode.ExtensionContext) {
	try {
		autoContext.init(context);
		log.info(`activate START ${context.extension?.packageJSON?.version} --------------------`);
		log.info('JAVA_HOME', process.env.JAVA_HOME);
		log.info('Global Storage', autoContext.getGlobalStoragePath());
		userSettings.setDefault();
		
		const runtimes = userSettings.getJavaConfigRuntimes();
		const runtimesOld = _.cloneDeep(runtimes);
		const jdtSupport = await jdtExtension.getJdtSupport();
		const isFirstStartup = !autoContext.existsDirectory(autoContext.getGlobalStoragePath());
		
		await scan(runtimes, runtimesOld, jdtSupport);
		await download(runtimes, jdtSupport);
		showMessage(runtimes, runtimesOld, isFirstStartup);
		log.info('activate END');
	} catch (e:any) {
		vscode.window.showErrorMessage(`Auto Config Java failed. ${e}`);
		log.error(e);
	}
}

/**
 * Scans the installed JDK and updates the Java configuration.
 * @param runtimes The Java runtimes to update.
 * @param runtimesOld The Java runtimes before scan.
 * @param jdtSupport The JDT supported versions.
 */
async function scan(
	runtimes: jdtExtension.JavaConfigRuntimeArray,
	runtimesOld: jdtExtension.JavaConfigRuntimeArray,
	jdtSupport: jdtExtension.IJdtSupport) {

	await jdkExplorer.scan(runtimes);
	await userSettings.updateJavaConfig(runtimes, runtimesOld, jdtSupport);
}

/**
 * Downloads the JDK and updates the Java configuration.
 * @param runtimes The Java runtimes to update.
 * @param jdtSupport The JDT supported versions.
 */
async function download(
	runtimes: jdtExtension.JavaConfigRuntimeArray,
	jdtSupport: jdtExtension.IJdtSupport) {

	if (!userSettings.get('extensions.autoUpdate')) {
		log.info(`Download disabled (extensions.autoUpdate: false)`);
	} else if (!jdk.isTargetPlatform) {
		log.info(`Download disabled (${process.platform}/${process.arch})`);
	} else if (jdtSupport.targetLtsVers.length === 0) {
		log.info(`Download disabled (Can't get target LTS versions)`);
	} else {
		const runtimesBeforeDownload = _.cloneDeep(runtimes);
		const promises = jdtSupport.targetLtsVers.map(ver => jdk.download(runtimes, ver));
		promises.push(maven.download());
		promises.push(gradle.download());
		await Promise.allSettled(promises);
		await userSettings.updateJavaConfig(runtimes, runtimesBeforeDownload, jdtSupport);
	}
}

/**
 * Shows the message.
 * @param runtimesNew The Java runtimes after update.
 * @param runtimesOld The Java runtimes before update.
 * @param isFirstStartup Whether this is the first startup.
 */
function showMessage(
	runtimesNew: jdtExtension.JavaConfigRuntimeArray,
	runtimesOld: jdtExtension.JavaConfigRuntimeArray,
	isFirstStartup: boolean) {
	
	const oldVers = runtimesOld.map(r => jdtExtension.versionOf(r.name));
	const newVers = runtimesNew.map(r => jdtExtension.versionOf(r.name));
	const defaultVer = jdtExtension.versionOf(runtimesNew.findDefault()?.name ?? '');
	log.info(`${jdtExtension.JavaConfigRuntimeArray.CONFIG_KEY} [${newVers}] default ${defaultVer}`);
	const availableMsg = `${l10n.t('Available Java versions:')} ${newVers.join(', ')}`;

	if (isFirstStartup) {
		autoContext.mkdirSyncQuietly(autoContext.getGlobalStoragePath());
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
				showReloadMessage(); // Suppress errors when downgrading Red Hat extension
			}
		}
	}
	setTimeout(setConfigChangedEvent, 5_000); // Delay for prevent self update
}

/**
 * Gets the language pack suffix.
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
	const msg = l10n.t('Configuration changed, please Reload Window.');
	const actionLabel = l10n.t('Reload');
	vscode.window.showWarningMessage(msg, actionLabel).then(selection => {
		if (actionLabel === selection) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}

/**
 * Sets the configuration changed event.
 */
function setConfigChangedEvent() {
	vscode.workspace.onDidChangeConfiguration(event => {
		if (
			// 'java.jdt.ls.java.home' is not defined because redhat.java extension is detected
			event.affectsConfiguration('spring-boot.ls.java.home') ||
			event.affectsConfiguration('java.import.gradle.java.home') ||
			// For Terminal Profiles
			event.affectsConfiguration('java.import.gradle.home') ||
			event.affectsConfiguration('maven.executable.path') ||
			event.affectsConfiguration('maven.terminal.customEnv') ||
			event.affectsConfiguration('java.configuration.runtimes')
		) {
			showReloadMessage();
		}
	});
}
