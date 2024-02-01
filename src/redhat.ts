/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as jdkutils from 'jdk-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as system from './system';
import { log } from './system';

/**
 * An interface for the VS Code Java configuration runtime.
 */
export interface IJavaRuntime {
	readonly name: string;
	path: string;
	default?: boolean;
}

/**
 * A class for the VS Code Java configuration runtime array.
 */
export class JavaRuntimeArray extends Array<IJavaRuntime> {
	
    static readonly CONFIG_KEY = 'java.configuration.runtimes';

	/**
	 * Finds the default Java runtime configuration for the VS Code Java extension.
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findDefault(): IJavaRuntime | undefined {
		return this.find(runtime => runtime.default);
	}

	/**
	 * Finds the Java runtime configuration for the VS Code Java extension.
	 * @param name The Java name to find. See nameOf(majorVer:number).
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findByName(name: string | undefined): IJavaRuntime | undefined {
        if (!name) {return undefined;}
		return this.find(runtime => runtime.name === name);
	}

	/**
	 * Finds the Java runtime configuration for the VS Code Java extension.
	 * @param version The Java version to find.
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findByVersion(version: number | undefined): IJavaRuntime | undefined {
        if (version === undefined) {return undefined;}
		return this.findByName(nameOf(version));
	}
}

/**
 * An interface that represents the Java configuration.
 */
export interface IJavaConfig {
    readonly availableNames: ReadonlyArray<string>;
    readonly availableVers: ReadonlyArray<number>;
    readonly downloadLtsVers: ReadonlyArray<number>;
    readonly latestLtsVer: number;
    readonly stableLtsVer: number;
    readonly embeddedJreVer?: number;
    needsReload?: boolean;
}

/**
 * @returns The Java configuration.
 */
export async function getJavaConfig(): Promise<IJavaConfig> {

    // Do not add redhat.java extension to extensionDependencies in package.json,
    // because this extension will not start when redhat activation error occurs.
    const redhatExtension = vscode.extensions.getExtension('redhat.java');
    const _availableNames = getAvailableNames(redhatExtension);
    const _availableVers = _availableNames.map(versionOf).filter(Boolean).sort((a,b) => a-b);
    const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
    const fourLatestLtsVers = _availableVers.filter(ltsFilter).slice(-4);
    const _latestLtsVer = fourLatestLtsVers.at(-1);
    
    const javaConfig:IJavaConfig = {
        availableNames: _availableNames,
        availableVers: _availableVers,
        downloadLtsVers: fourLatestLtsVers,
        latestLtsVer: _latestLtsVer ?? 0,
        stableLtsVer: (_latestLtsVer === _availableVers.at(-1) ? fourLatestLtsVers.at(-2) : _latestLtsVer) ?? 0,
        embeddedJreVer: await findEmbeddedJREVersion(redhatExtension),
    };
    const {availableNames, ...forLog} = javaConfig;
    Object.entries(forLog).forEach(([k,v]) => log.info(`JavaConfig ${k}: ${v}`));
    return javaConfig;
}

async function findEmbeddedJREVersion(redhatExtension: vscode.Extension<any> | undefined): Promise<number | undefined> {
    const redhatExtDir = redhatExtension?.extensionUri?.fsPath;
    if (redhatExtDir) {
        // C:\Users\(UserName)\.vscode\extensions\redhat.java-1.21.0-win32-x64
        // C:\Users\(UserName)\.vscode\extensions\redhat.java-1.21.0-win32-x64\jre\17.0.7-win32-x86_64\bin
        const javaExePath = path.join(redhatExtDir, 'jre', '*', 'bin', jdkutils.JAVA_FILENAME);
        const javaExeFiles = await system.globSearch(javaExePath);
        if (javaExeFiles.length > 0) {
            const jreHomeDir = path.join(javaExeFiles[0], '..', '..');
            const runtime = await jdkutils.getRuntime(jreHomeDir, { withVersion: true });
            return runtime?.version?.major;
        }
    }
    // mac Parallels Windows Arm
    // redhat.java test version
    return undefined;
}

function getAvailableNames(redhatExtension: vscode.Extension<any> | undefined): string[] {
    let config = redhatExtension?.packageJSON?.contributes?.configuration;
    if (Array.isArray(config)) {
        config = config.find(c => c.properties?.[JavaRuntimeArray.CONFIG_KEY]);
    }
    const runtimeNames = config?.properties?.[JavaRuntimeArray.CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
    if (runtimeNames.length === 0) {
        log.warn('Failed getExtension RedHat', redhatExtension);
    }
    return runtimeNames;
}

/**
 * Returns the JDK major version that matches the given JDK.
 * @param runtimeName The name of the VS Code JDT runtime.
 * @returns The JDK major version. NaN if invalid runtimeName.
 */
export function versionOf(runtimeName:string): number {
    return Number(runtimeName.replace(/^J(ava|2)SE-(1\.|)/, ''));
}

/**
 * Returns the VS Code JDT runtime name that matches the given JDK major version.
 * @param majorVer The JDK major version.
 * @returns The VS Code JDT runtime name.
 */
export function nameOf(majorVer:number): string {
    if (majorVer <= 5) {
        return 'J2SE-1.' + majorVer;
    }
    if (majorVer <= 8) {
        return 'JavaSE-1.' + majorVer;
    }
    return 'JavaSE-' + majorVer;
}
