/*! VSCode Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as autoContext from '../autoContext';
import { log } from '../autoContext';
import * as downloader from '../downloader';
import * as userSettings from '../userSettings';
export const CONFIG_KEY_MAVEN_EXE_PATH = 'maven.executable.path';

/**
 * Downloads and installs the Maven if it is not already installed.
 * @return A promise that resolves when the Maven is installed.
 */
export async function download() {
	try {
		const mavenExePathOld = userSettings.get<string>(CONFIG_KEY_MAVEN_EXE_PATH);
		const mavenExePathNew = await downloadProc(mavenExePathOld);
		if (mavenExePathOld !== mavenExePathNew) {
			await userSettings.update(CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathNew);
		}
	} catch (error) {
		log.info('Failed download Maven', error);
	}
}

async function downloadProc(
	mavenExePathOld:string | undefined): Promise<string | undefined> {

	let mavenExePathNew = mavenExePathOld;
	const storageMavenDir = path.join(autoContext.getGlobalStoragePath(), 'maven');
    const versionDirName = 'latest';
	const homeDir = path.join(storageMavenDir, versionDirName);

	// Skip User Installed
	if (mavenExePathOld) {
		const fixedPath = fixPath(mavenExePathOld);
		if (!fixedPath) {
			log.info('Remove invalid settings', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathOld);
			mavenExePathNew = undefined;
		} else {
			if (fixedPath !== mavenExePathOld) {
				log.info(`Fix ${CONFIG_KEY_MAVEN_EXE_PATH}\n   ${mavenExePathOld}\n-> ${fixedPath}`);
			}
			mavenExePathNew = fixedPath;
			if (autoContext.isUserInstalled(mavenExePathNew)) {
				log.info('Available Maven (User installed)', CONFIG_KEY_MAVEN_EXE_PATH, mavenExePathNew);
				return mavenExePathNew;
			}
		}
	}
	if (!mavenExePathNew) {
		const exeSystemPath = await autoContext.whichPath('mvn');
		if (exeSystemPath) {
			log.info('Available Maven (PATH)', exeSystemPath);
			return mavenExePathNew; // Don't set config (Setting > mvnw > PATH)
		}
		if (isValidHome(homeDir)) {
			mavenExePathNew = getExePath(homeDir);
		}
	}

    // Get Latest Version
    const URL_PREFIX = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/';
	const xml = (await axios.get(URL_PREFIX + 'maven-metadata.xml')).data;
    const versionTag:string = _.last(xml.match(/<version>\d+\.\d+\.\d+<\/version>/g)) ?? '';
    const version = versionTag.replace(/<.+?>/g, '');

	// Check Version File
	const versionFile = path.join(homeDir, 'version.txt');
	const versionOld = autoContext.readString(versionFile);
	if (version === versionOld && isValidHome(homeDir)) {
		log.info(`Available Maven ${version} (No updates)`);
		return mavenExePathNew;
	}

    // Download
	await downloader.execute({
		downloadUrl: `${URL_PREFIX}${version}/apache-maven-${version}-bin.tar.gz`,
		downloadedFile: homeDir + '_download_tmp.tar.gz',
		extractDestDir: homeDir,
		targetMessage: `Maven ${version}`,
	});
	if (!isValidHome(homeDir)) {
		log.info('Invalid Maven:', homeDir);
		mavenExePathNew = undefined;
		return mavenExePathNew; // Silent
	}
	fs.writeFileSync(versionFile, version);

	// Set Settings
	mavenExePathNew = getExePath(homeDir);
	return mavenExePathNew;
}

function isValidHome(homeDir:string) {
    return autoContext.existsFile(getExePath(homeDir));
}

function getExePath(homeDir:string) {
	return path.join(homeDir, 'bin', 'mvn');
}

function fixPath(exePath:string): string | undefined {
	if (autoContext.existsFile(exePath)) {return exePath;}
	let fixedPath = path.join(exePath, 'bin', 'mvn');
	if (autoContext.existsFile(fixedPath)) {return fixedPath;}
	fixedPath = path.join(exePath, 'mvn');
	if (autoContext.existsFile(fixedPath)) {return fixedPath;}
	return undefined;
}
