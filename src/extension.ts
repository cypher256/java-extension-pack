import * as vscode from 'vscode';
import axios from 'axios';

export function deactivate() {
	console.log('[Pleiades] deactivate');
}

export function activate(context: vscode.ExtensionContext) {
	console.log('[Pleiades] activate', context.extensionPath);
	console.log(4, context.globalStorageUri.fsPath); // ユーザー
	console.log(5, context.storageUri?.fsPath); // ワークスペース

	const conf = vscode.workspace.getConfiguration();
	const RUNTIMES_KEY = 'java.configuration.runtimes';
	let runtimes:any[] = conf.get(RUNTIMES_KEY) || [];
	// conf.update(RUNTIMES_KEY, runtimes, vscode.ConfigurationTarget.Global);

	for (const version of [8, 11, 17]) {
		const url = `https://github.com/adoptium/temurin${version}-binaries/releases/latest`;
		downloadJdk(version, url);
	}
}

/*
Download JDK.

first URL
https://github.com/adoptium/temurin8-binaries/releases/latest
https://github.com/adoptium/temurin11-binaries/releases/latest
https://github.com/adoptium/temurin17-binaries/releases/latest

redirected URL
https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u362-b09
https://github.com/adoptium/temurin11-binaries/releases/tag/jdk-11.0.18+10
https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.6+10

download URL
https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_windows_hotspot_8u362b09.zip
https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u362-b09/OpenJDK8U-jdk_x64_mac_hotspot_8u362b09.tar.gz
https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_windows_hotspot_11.0.18_10.zip
https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.18%2B10/OpenJDK11U-jdk_x64_mac_hotspot_11.0.18_10.tar.gz
https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_windows_hotspot_17.0.6_10.zip
https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.6%2B10/OpenJDK17U-jdk_x64_mac_hotspot_17.0.6_10.tar.gz
 */
function downloadJdk(version:number, firstUrl:string):void {
	axios.get(firstUrl)
	.then(response => {
		const redirectedUrl:string = response.request.res.responseUrl;
		const ver = redirectedUrl.replace(/.+tag\//, '');
		const p1 = ver.replace('+', '%2B');
		const p2 = ver.replace('+', '_').replace(/(jdk|-)/g, '');

		for (const arch of [
			'x64_windows_hotspot', 
			// 'x64_mac_hotspot', 
			// 'aarch64_mac_hotspot',
		]) {
			const downloadUrl = `https://github.com/adoptium/temurin${version}-binaries/releases/download/` +
				`${p1}/OpenJDK${version}U-jdk_${arch}_${p2}.${arch.includes('windows') ? 'zip' : 'tar.gz'}`;
			console.log('[Pleiades] ' + downloadUrl);

			// vscode.workspace.fs.writeFile
		}

    }).catch(e => {
		let message = '';
		if (e.message) message += e.message;
		if (e.request && e.request.path) message += ' ' + e.request.path;
		if (message.length == 0) {
			console.error(e);
			message = e.toString();
		}
		vscode.window.showErrorMessage(message);
    });
}
