import axios from 'axios';
import console from 'console';
import * as fs from 'fs';

const RUNTIMES_CONFIG_NAME = 'java.configuration.runtimes';
const REDHAT_URL = 'https://raw.githubusercontent.com/redhat-developer/vscode-java/master/package.json';
const redhatJson = (await axios.get(REDHAT_URL)).data;
const configs = redhatJson.contributes?.configuration;
const config = configs.find(c => c.properties?.[RUNTIMES_CONFIG_NAME]);
const runtimeNames = config?.properties?.[RUNTIMES_CONFIG_NAME]?.items?.properties?.name?.enum ?? [];
const latestVer = runtimeNames.at(-1).replace(/^JavaSE-/, '');
console.log('RedHat support latest version:', latestVer);

const README_NAME = 'README.md';
const text = fs.readFileSync(README_NAME).toString();
const newText = text.replace(/(Java(?: |%20))\d+([ -]Ready)/ig, `$1${latestVer}$2`);
if (text !== newText) {
	fs.writeFileSync(README_NAME, newText);
	console.log('👉 Updated the latest Java version in README.md.');
}
