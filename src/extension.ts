/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as _ from "lodash";
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as autoContext from './autoContext';
import { OS, log } from './autoContext';
import * as gradleDownloader from './download/gradle';
import * as jdkDownloader from './download/jdk';
import * as mavenDownloader from './download/maven';
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
	log.info('Global Storage', autoContext.getGlobalStoragePath());
	userSettings.setDefault();

	const availableVers = javaExtension.getAvailableVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVers = availableVers.filter(ltsFilter).slice(-4);
	const latestLtsVer = targetLtsVers.at(-1);
	const stableLtsVer = (latestLtsVer === availableVers.at(-1) ? targetLtsVers.at(-2) : latestLtsVer) ?? 0;
	log.info('Supported Java versions', availableVers);
	log.info(`Target LTS versions [${targetLtsVers}] default ${stableLtsVer}`);
	
	const runtimes = userSettings.getJavaConfigRuntimes();
	const runtimesOld = _.cloneDeep(runtimes);
	const isFirstStartup = !autoContext.existsDirectory(autoContext.getGlobalStoragePath()); // Removed on uninstall

	await scan(runtimes, runtimesOld, stableLtsVer);
	await download(runtimes, availableVers, targetLtsVers, stableLtsVer);
	setMessage(runtimes, runtimesOld, isFirstStartup);
	log.info('activate END');
}

async function scan(
	runtimes: userSettings.IJavaConfigRuntime[],
	runtimesOld: userSettings.IJavaConfigRuntime[],
	stableLtsVer: number) {

	try {
		await jdkExplorer.scan(runtimes);
		await userSettings.updateJavaConfigRuntimes(runtimes, runtimesOld, stableLtsVer);
	} catch (e: any) {
		const message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}
}

async function download(
	runtimes: userSettings.IJavaConfigRuntime[],
	availableVers: number[],
	targetLtsVers: number[],
	stableLtsVer: number) {

	if (!userSettings.get('extensions.autoUpdate')) {
		log.info(`Download disabled (extensions.autoUpdate: false)`);
	} else if (!jdkDownloader.isTargetPlatform) {
		log.info(`Download disabled (${process.platform}/${process.arch})`);
	} else if (targetLtsVers.length === 0) {
		log.info(`Download disabled (Can't get target LTS versions)`);
	} else {
		try {
			const runtimesBeforeDownload = _.cloneDeep(runtimes);
			const downloadVers = _.uniq([...targetLtsVers, availableVers.at(-1) ?? 0]);
			const promiseArray = downloadVers.map(ver => jdkDownloader.execute(runtimes, ver));
			promiseArray.push(mavenDownloader.execute());
			promiseArray.push(gradleDownloader.execute());
			await Promise.allSettled(promiseArray);
			await userSettings.updateJavaConfigRuntimes(runtimes, runtimesBeforeDownload, stableLtsVer);
		} catch (e: any) {
			const message = `Download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
			log.info(message, e);
		}
	}
}

function setMessage(
	runtimesNew:userSettings.IJavaConfigRuntime[],
	runtimesOld:userSettings.IJavaConfigRuntime[],
	isFirstStartup:boolean) {
	
	const oldVers = runtimesOld.map(r => javaExtension.versionOf(r.name));
	const newVers = runtimesNew.map(r => javaExtension.versionOf(r.name));
	const defaultVer = javaExtension.versionOf(runtimesNew.find(r => r.default)?.name ?? '');
	log.info(`${javaExtension.CONFIG_KEY_RUNTIMES} [${newVers}] default ${defaultVer}`);
	const availableMsg = `${l10n.t('Available Java versions:')} ${newVers.join(', ')}`;

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
				setTimeout(showReloadMessage, 15_000); // Delay for above cancel
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
		const added = _.difference(newVers, oldVers);
		if (added.length > 0) {
			const msg = l10n.t('The following Java Runtime Configuration added. Version:');
			vscode.window.showInformationMessage(`${msg} ${added.join(', ')} (${availableMsg})`);
		} else {
			const removed = _.difference(oldVers, newVers);
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

function getLangPackSuffix(): string | undefined {
	const osLocale = OS.locale;
	if (osLocale.match(/^(cs|de|es|fr|it|ja|ko|pl|ru|tr)/)) { // Active only
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

function showReloadMessage() {
	const msg = l10n.t('Configuration changed, please Reload Window.');
	const actionLabel = l10n.t('Reload');
	vscode.window.showWarningMessage(msg, actionLabel).then(selection => {
		if (actionLabel === selection) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}
