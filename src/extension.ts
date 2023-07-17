/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
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
	userSettings.setDefault();

	// Get JDK versions
	const availableVersions = javaExtension.getAvailableVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVersions = availableVersions.filter(ltsFilter).slice(-4);
	const latestLtsVersion = _.last(targetLtsVersions) ?? 0;
	log.info('Supported Java versions', availableVersions);
	log.info('Target LTS versions', targetLtsVersions);
	const runtimes = userSettings.getJavaConfigRuntimes();
	const runtimesOld = _.cloneDeep(runtimes);
	const isFirstStartup = !autoContext.existsDirectory(autoContext.getGlobalStoragePath()); // Removed on uninstall

	// Scan JDK
	try {
		await jdkExplorer.scan(runtimes);
		await userSettings.updateJavaConfigRuntimes(runtimes, runtimesOld, latestLtsVersion);
	} catch (e:any) {
		const message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}

	// Download JDK, Gradle, Maven
	if (!userSettings.get('extensions.autoUpdate')) {
		log.info(`activate END. Download disabled (extensions.autoUpdate: false)`);
	} else if (!downloadJdk.isTargetPlatform) {
		log.info(`activate END. Download disabled (${process.platform}/${process.arch})`);
	} else if (targetLtsVersions.length === 0) {
		log.info(`activate END. Download disabled (Can't get targetLtsVersions)`);
	} else {
		try {
			const runtimesBeforeDownload = _.cloneDeep(runtimes);
			const downloadVersions = _.uniq([...targetLtsVersions, _.last(availableVersions) ?? 0]);
			const promiseArray = downloadVersions.map(v => downloadJdk.download(runtimes, v));
			promiseArray.push(downloadMaven.download());
			promiseArray.push(downloadGradle.download());
			await Promise.allSettled(promiseArray);
			await userSettings.updateJavaConfigRuntimes(runtimes, runtimesBeforeDownload, latestLtsVersion);
			log.info('activate END');
		} catch (e:any) {
			const message = `Download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
			log.info(message, e); // Silent: offline, 404 building, 503 proxy auth error, etc.
		}
	}
	addConfigChangeEvent(isFirstStartup, runtimes, runtimesOld);
}

function getLangPackSuffix(): string | undefined {
	const osLocale = OS.locale;
	if (osLocale.match(/^(cs|de|es|fr|it|ja|ko|pl|ru|tr)/)) {
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
	runtimesNew:userSettings.IJavaConfigRuntime[],
	runtimesOld:userSettings.IJavaConfigRuntime[]) {
	
	const versionsOld = runtimesOld.map(r => javaExtension.versionOf(r.name));
	const versionsNew = runtimesNew.map(r => javaExtension.versionOf(r.name));
	log.info(javaExtension.CONFIG_KEY_RUNTIMES, versionsNew);
	const availableMsg = `${l10n.t('Available Java versions:')} ${versionsNew.join(', ')}`;

	// First Setup
	if (isFirstStartup) {
		autoContext.mkdirSyncQuietly(autoContext.getGlobalStoragePath());
		vscode.window.showInformationMessage(availableMsg);

		if (OS.isWindows || OS.isLinux) {
			installExtension('s-nlf-fh.glassit');
		}
		const langPackSuffix = getLangPackSuffix();
		if (langPackSuffix) {
			installExtension('intellsmi.comment-translate');
			const langPackId = 'ms-ceintl.vscode-language-pack-' + langPackSuffix;
			if (!vscode.extensions.getExtension(langPackId)) {
				installExtension(langPackId); // Restart message
				setTimeout(showReloadMessage, 15_000); // Delay for above
			} else {
				if (vscode.env.language === 'en') {
					// Choose display language, restart modal dialog
					vscode.commands.executeCommand('workbench.action.configureLocale');
					setTimeout(showReloadMessage, 15_000); // Delay for cancel selected
				} else {
					showReloadMessage();
				}
			}
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

	// User Manual Change Event
	setTimeout(() => {
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
	}, 5_000); // Prevent update by self
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
