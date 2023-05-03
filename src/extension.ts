/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import * as vscode from 'vscode';
import * as _ from "lodash";
import * as jdkconfig from './jdkconfig';
import * as jdkscan from './jdkscan';
import * as jdkdownload from './jdkdownload';
import * as jdkcontext from './jdkcontext';
const { log } = jdkcontext;

/**
 * Activates the extension.
 * @param context The extension context.
 */
export async function activate(context:vscode.ExtensionContext) {

	jdkcontext.init(context);
	log.info('activate START --------------------');
	log.info('JAVA_HOME', process.env.JAVA_HOME);
	log.info('Download location', jdkcontext.getGlobalStoragePath());

	jdkconfig.setDefault();
	const STATE_KEY_ACTIVATED = 'activated';
	if (!jdkcontext.context.globalState.get(STATE_KEY_ACTIVATED)) {
		jdkcontext.context.globalState.update(STATE_KEY_ACTIVATED, true);
		installLanguagePack();
	}
	const redhatVersions = jdkconfig.runtime.getRedhatVersions();
	const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
	const targetLtsVersions = redhatVersions.filter(ltsFilter).slice(-4);
	const latestLtsVersion = _.last(targetLtsVersions) ?? 0;
	log.info('RedHat versions ' + redhatVersions);
	log.info('Target LTS versions ' + targetLtsVersions);
	const runtimes = jdkconfig.getRuntimes();

	// Scan JDK
	try {
		const runtimesOld = _.cloneDeep(runtimes);
		await jdkscan.scan(runtimes);
		await jdkconfig.update(runtimes, runtimesOld, latestLtsVersion);

	} catch (e:any) {
		let message = `JDK scan failed. ${e.message ?? e}`;
		vscode.window.showErrorMessage(message);
		log.warn(message, e);
	}

	// Download JDK
	if (jdkdownload.isTarget && targetLtsVersions.length > 0) {
		vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
			try {
				const runtimesOld = _.cloneDeep(runtimes);
				const downloadVersions = _.uniq([...targetLtsVersions, _.last(redhatVersions) ?? 0]);
				const promiseArray = downloadVersions.map(v => jdkdownload.download(runtimes, v, progress));
				await Promise.all(promiseArray);
				await jdkconfig.update(runtimes, runtimesOld, latestLtsVersion);
	
			} catch (e:any) {
				let message = `JDK download failed. ${e.request?.path ?? ''} ${e.message ?? e}`;
				log.info(message, e); // Silent: offline, 404 building, 503 proxy auth error, etc.
			}
			log.info('activate END');
		});
	}
}

/**
 * Install the language pack corresponding to the OS locale at the first startup.
 */
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
		await vscode.commands.executeCommand( // Silent if already installed
			'workbench.extensions.installExtension', 'ms-ceintl.vscode-language-pack-' + lang);
		log.info('Installed language pack', lang);
	} catch (error) {
		log.info('Failed to install language pack.', error); // Silent
	}
}
