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
 */
export async function activate(context:vscode.ExtensionContext) {

	autoContext.init(context);
	log.info(`activate START ${context.extension?.packageJSON?.version} --------------------`);
	log.info('JAVA_HOME', process.env.JAVA_HOME);
	log.info('Save Location', autoContext.getGlobalStoragePath());

	userSettings.setDefault();
	const STATE_KEY_ACTIVATED = 'activated';
	if (!autoContext.context.globalState.get(STATE_KEY_ACTIVATED)) {
		autoContext.context.globalState.update(STATE_KEY_ACTIVATED, true);
		installLanguagePack();
		if (OS.isWindows || OS.isLinux) {
			installExtension('s-nlf-fh.glassit');
		}
	}

	// Get JDK versions
	const availableVersions = javaExtension.getAvailableVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVersions = availableVersions.filter(ltsFilter).slice(-4);
	const latestLtsVersion = _.last(targetLtsVersions) ?? 0;
	log.info('Supported Java versions ' + availableVersions);
	log.info('Target LTS versions ' + targetLtsVersions);
	const runtimes = userSettings.getJavaRuntimes();

	// Scan JDK
	try {
		const runtimesOld = _.cloneDeep(runtimes);
		await jdkExplorer.scan(runtimes);
		await userSettings.updateJavaRuntimes(runtimes, runtimesOld, latestLtsVersion);
	} catch (e:any) {
		const message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}

	// Download JDK
	if (!userSettings.get('extensions.autoUpdate')) {
		addConfigChangeEvent();
		log.info(`activate END. Download disabled (extensions.autoUpdate: false).`);
		return;
	}
	if (!downloadJdk.isTargetPlatform || targetLtsVersions.length === 0) {
		addConfigChangeEvent();
		log.info(`activate END. isTargetPlatform:${downloadJdk.isTargetPlatform} ${process.platform}/${process.arch}`);
		return;
	}
	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		try {
			const runtimesOld = _.cloneDeep(runtimes);
			const downloadVersions = _.uniq([...targetLtsVersions, _.last(availableVersions) ?? 0]);
			const promiseArray = downloadVersions.map(v => downloadJdk.download(runtimes, v, progress));
			promiseArray.push(downloadMaven.download(progress));
			promiseArray.push(downloadGradle.download(progress));
			await Promise.allSettled(promiseArray);
			await userSettings.updateJavaRuntimes(runtimes, runtimesOld, latestLtsVersion);
		} catch (e:any) {
			const message = `JDK download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
			log.info(message, e); // Silent: offline, 404 building, 503 proxy auth error, etc.
		}
		addConfigChangeEvent();
		log.info('activate END');
	});
}

async function installLanguagePack() {
	try {
		const osLocale = JSON.parse(process.env.VSCODE_NLS_CONFIG!).osLocale.toLowerCase();
		let lang = null;
		if (osLocale.match(/^(cs|de|es|fr|it|ja|ko|pl|ru|tr)/)) {
			lang = osLocale.substr(0, 2);
		} else if (osLocale.startsWith('pt-br')) {
			lang = 'pt-BR'; // Portuguese (Brazil)
		} else if (osLocale.match(/^zh-(hk|tw)/)) {
			lang = 'zh-hant'; // Chinese (Traditional)
		} else if (osLocale.startsWith('zh')) {
			lang = 'zh-hans'; // Chinese (Simplified)
		} else {
			return;
		}
		await installExtension('ms-ceintl.vscode-language-pack-' + lang);
		await installExtension('intellsmi.comment-translate');
	} catch (error) {
		log.info('Failed to install language pack.', error); // Silent
	}
}

async function installExtension(extensionId:string) {
	try {
		await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
		log.info('Installed extension', extensionId);
	} catch (error) {
		log.info('Failed to install extension.', error); // Silent
	}
}

function addConfigChangeEvent() {
	vscode.workspace.onDidChangeConfiguration(event => {
		if (
			// 'java.jdt.ls.java.home' is not defined because redhat.java extension is detected
			event.affectsConfiguration('spring-boot.ls.java.home') ||
			event.affectsConfiguration('rsp-ui.rsp.java.home') ||
			event.affectsConfiguration('java.import.gradle.java.home') ||
			event.affectsConfiguration('java.import.gradle.home') ||
			event.affectsConfiguration('maven.executable.path')
		) {
			const msg = l10n.t('Configuration changed, please Reload Window.');
			const actionLabel = l10n.t('Reload');
			vscode.window.showWarningMessage(msg, actionLabel).then(selection => {
				if (actionLabel === selection) {
					vscode.commands.executeCommand('workbench.action.reloadWindow');
				}
			});
		}
	});
}
