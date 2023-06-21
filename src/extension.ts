/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as _ from "lodash";
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as autoContext from './autoContext';
import { OS, log } from './autoContext';
import * as downloadGradle from './download/gradle';
import * as downloadJdk from './download/jdk';
import * as downloadMaven from './download/maven';
import * as javaExtension from './javaExtension';
import * as jdkExplorer from './jdkExplorer';
import * as userSettings from './userSettings';

/**
 * Activates the extension.
 * @param context The extension context.
 * @return A promise that resolves when the extension is activated.
 */
export async function activate(context:vscode.ExtensionContext) {

	autoContext.init(context);
	log.info(`activate START ${context.extension?.packageJSON?.version} --------------------`);
	log.info('JAVA_HOME', process.env.JAVA_HOME);
	log.info('Save Location', autoContext.getGlobalStoragePath());

	// First Setup
	userSettings.setDefault();
	const STATE_KEY_FIRST_ACTIVATED = 'activated';
	const isFirstStartup = !autoContext.context.globalState.get(STATE_KEY_FIRST_ACTIVATED);
	let nowInstalledLangPack = false;
	if (isFirstStartup) {
		autoContext.context.globalState.update(STATE_KEY_FIRST_ACTIVATED, true);
		const langPackSuffix = getLangPackSuffix();
		if (langPackSuffix) {
			nowInstalledLangPack = true;
			installExtension('ms-ceintl.vscode-language-pack-' + langPackSuffix);
			installExtension('intellsmi.comment-translate');
		}
		if (OS.isWindows || OS.isLinux) {
			installExtension('s-nlf-fh.glassit');
		}
	}

	// Get JDK versions
	const availableVersions = javaExtension.getAvailableVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVersions = availableVersions.filter(ltsFilter).slice(-4);
	const latestLtsVersion = _.last(targetLtsVersions) ?? 0;
	log.info('Supported Java versions', availableVersions);
	log.info('Target LTS versions', targetLtsVersions);
	const runtimes = userSettings.getJavaRuntimes();
	const runtimesOld = _.cloneDeep(runtimes);

	// Scan JDK
	try {
		await jdkExplorer.scan(runtimes);
		await userSettings.updateJavaRuntimes(runtimes, runtimesOld, latestLtsVersion);
	} catch (e:any) {
		const message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}

	// Download JDK, Gradle, Maven
	if (!userSettings.get('extensions.autoUpdate')) {
		addConfigChangeEvent(isFirstStartup, nowInstalledLangPack, runtimes, runtimesOld);
		log.info(`activate END. Download disabled (extensions.autoUpdate: false).`);
		return;
	}
	if (!downloadJdk.isTargetPlatform || targetLtsVersions.length === 0) {
		addConfigChangeEvent(isFirstStartup, nowInstalledLangPack, runtimes, runtimesOld);
		log.info(`activate END. isTargetPlatform:${downloadJdk.isTargetPlatform} ${process.platform}/${process.arch}`);
		return;
	}
	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		try {
			const runtimesBeforeDownload = _.cloneDeep(runtimes);
			const downloadVersions = _.uniq([...targetLtsVersions, _.last(availableVersions) ?? 0]);
			const promiseArray = downloadVersions.map(v => downloadJdk.download(runtimes, v, progress));
			promiseArray.push(downloadMaven.download(progress));
			promiseArray.push(downloadGradle.download(progress));
			await Promise.allSettled(promiseArray);
			await userSettings.updateJavaRuntimes(runtimes, runtimesBeforeDownload, latestLtsVersion);
		} catch (e:any) {
			const message = `JDK download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
			log.info(message, e); // Silent: offline, 404 building, 503 proxy auth error, etc.
		}
		addConfigChangeEvent(isFirstStartup, nowInstalledLangPack, runtimes, runtimesOld);
		log.info('activate END');
	});
}

function getLangPackSuffix(): string | undefined {
	try {
		const osLocale = JSON.parse(process.env.VSCODE_NLS_CONFIG!).osLocale.toLowerCase();
		if (osLocale.match(/^(cs|de|es|fr|it|ja|ko|pl|ru|tr)/)) {
			return osLocale.substr(0, 2);
		} else if (osLocale.startsWith('pt-br')) {
			return 'pt-BR'; // Portuguese (Brazil)
		} else if (osLocale.match(/^zh-(hk|tw)/)) {
			return 'zh-hant'; // Chinese (Traditional)
		} else if (osLocale.startsWith('zh')) {
			return 'zh-hans'; // Chinese (Simplified)
		}
	} catch (error) {
		log.info('Failed to resolve language pack lang.', error); // Silent
	}
	return undefined;
}

async function installExtension(extensionId:string) {
	try {
		await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
		log.info('Installed extension', extensionId);
	} catch (error) {
		log.info('Failed to install extension.', error); // Silent
	}
}

function addConfigChangeEvent(
	isFirstStartup:boolean,
	nowInstalledLangPack:boolean,
	runtimesNew:userSettings.IJavaRuntime[],
	runtimesOld:userSettings.IJavaRuntime[]) {
	
	const versionsOld = runtimesOld.map(r => javaExtension.versionOf(r.name));
	const versionsNew = runtimesNew.map(r => javaExtension.versionOf(r.name));
	log.info(javaExtension.CONFIG_KEY_RUNTIMES, versionsNew);
	const availableMsg = `${l10n.t('Available Java versions:')} ${versionsNew.join(', ')}`;

	if (isFirstStartup) {
		vscode.window.showInformationMessage(availableMsg);
		if (nowInstalledLangPack && vscode.env.language === 'en') {
			// Choose display language, restart VSCode
			vscode.commands.executeCommand('workbench.action.configureLocale');
			setTimeout(showReloadMessage, 15_000); // Delay for prefer above
		} else {
			showReloadMessage();
		}
	} else {
		const added = _.difference(versionsNew, versionsOld);
		if (added.length > 0) {
			const msg = l10n.t('The following Java Runtime Configuration added. Version:');
			vscode.window.showInformationMessage(`${msg} ${added.join(', ')} (${availableMsg})`);
		} else {
			const removed = _.difference(versionsOld, versionsNew);
			if (removed.length > 0) {
				const msg = l10n.t('The following Java Runtime Configuration removed. Version:');
				vscode.window.showInformationMessage(`${msg} ${removed.join(', ')} (${availableMsg})`);
			}
		}
	}

	vscode.workspace.onDidChangeConfiguration(event => {
		if (
			// 'java.jdt.ls.java.home' is not defined because redhat.java extension is detected
			event.affectsConfiguration('spring-boot.ls.java.home') ||
			event.affectsConfiguration('rsp-ui.rsp.java.home') ||
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

function showReloadMessage() {
	const msg = l10n.t('Configuration changed, please Reload Window.');
	const actionLabel = l10n.t('Reload');
	vscode.window.showWarningMessage(msg, actionLabel).then(selection => {
		if (actionLabel === selection) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}
