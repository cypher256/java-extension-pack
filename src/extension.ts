/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as _ from "lodash";
import * as vscode from 'vscode';
import * as downloadgradle from './download/gradle';
import * as downloadjdk from './download/jdk';
import * as downloadmaven from './download/maven';
import * as jdkcontext from './jdkcontext';
import * as jdkscan from './jdkscan';
import * as jdksettings from './jdksettings';
const { log, OS } = jdkcontext;

/**
 * Activates the extension.
 * @param context The extension context.
 */
export async function activate(context:vscode.ExtensionContext) {

	jdkcontext.init(context);
	log.info(`activate START ${context.extension?.packageJSON?.version} --------------------`);
	log.info('JAVA_HOME', process.env.JAVA_HOME);
	log.info('Save Location', jdkcontext.getGlobalStoragePath());

	jdksettings.setDefault();
	const STATE_KEY_ACTIVATED = 'activated';
	if (!jdkcontext.context.globalState.get(STATE_KEY_ACTIVATED)) {
		jdkcontext.context.globalState.update(STATE_KEY_ACTIVATED, true);
		installLanguagePack();
		if (OS.isWindows || OS.isLinux) {
			installExtension('s-nlf-fh.glassit');
		}
	}

	// Get JDK versions
	const availableVersions = jdksettings.runtime.getAvailableVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVersions = availableVersions.filter(ltsFilter).slice(-4);
	const latestLtsVersion = _.last(targetLtsVersions) ?? 0;
	log.info('Supported Java versions ' + availableVersions);
	log.info('Target LTS versions ' + targetLtsVersions);
	const runtimes = jdksettings.runtime.getConfigRuntimes();

	// Scan JDK
	try {
		const runtimesOld = _.cloneDeep(runtimes);
		await jdkscan.scan(runtimes);
		await jdksettings.updateRuntimes(runtimes, runtimesOld, latestLtsVersion);
	} catch (e:any) {
		const message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}

	// Download JDK
	if (!downloadjdk.isTarget || targetLtsVersions.length === 0) {
		log.info(`activate END. jdkdownload.isTarget:${downloadjdk.isTarget} ${process.platform}/${process.arch}`);
		return;
	}
	vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
		try {
			const runtimesOld = _.cloneDeep(runtimes);
			const downloadVersions = _.uniq([...targetLtsVersions, _.last(availableVersions) ?? 0]);
			const promiseArray = downloadVersions.map(v => downloadjdk.download(runtimes, v, progress));
			promiseArray.push(downloadmaven.download(progress));
			promiseArray.push(downloadgradle.download(progress));
			await Promise.allSettled(promiseArray);
			await jdksettings.updateRuntimes(runtimes, runtimesOld, latestLtsVersion);
		} catch (e:any) {
			const message = `JDK download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
			log.info(message, e); // Silent: offline, 404 building, 503 proxy auth error, etc.
		}
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
