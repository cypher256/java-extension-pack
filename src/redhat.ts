/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as jdkutils from 'jdk-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as system from './system';
import { log } from './system';

/**
 * An interface for the VS Code Java configuration runtime.
 */
export interface IJavaConfigRuntime {
    readonly name: string;
    path: string;
    default?: boolean;
}

/**
 * A class for the VS Code Java configuration runtime array.
 */
export class JavaConfigRuntimes extends Array<IJavaConfigRuntime> {

    static readonly CONFIG_NAME = 'java.configuration.runtimes';

    /**
     * Finds the default Java runtime configuration for the VS Code Java extension.
     * @returns A Java runtime object. If no entry exists, returns undefined.
     */
    findDefault(): IJavaConfigRuntime | undefined {
        return this.find(runtime => runtime.default);
    }

    /**
     * Finds the Java runtime configuration for the VS Code Java extension.
     * @param name The Java name to find. See nameOf(majorVer: number).
     * @returns A Java runtime object. If no entry exists, returns undefined.
     */
    findByName(name?: string): IJavaConfigRuntime | undefined {
        if (!name) { return undefined; }
        return this.find(runtime => runtime.name === name);
    }

    /**
     * Finds the Java runtime configuration for the VS Code Java extension.
     * @param version The Java version to find.
     * @returns A Java runtime object. If no entry exists, returns undefined.
     */
    findByVersion(version?: number): IJavaConfigRuntime | undefined {
        if (version === undefined) { return undefined; }
        return this.findByName(nameOf(version));
    }
}

/**
 * An interface that represents the Java configuration.
 */
export interface IJavaConfig {
    readonly isFirstStartup: boolean;
    readonly availableNames: ReadonlyArray<string>;
    readonly availableVers: ReadonlyArray<number>;
    readonly downloadLtsVers: ReadonlyArray<number>;
    readonly latestAvailableVer: number;
    readonly latestLtsVer: number;
    readonly stableLtsVer: number;
    readonly embeddedJreVer?: number;
    needsReload?: boolean;
    latestVerPath?: string;
}

/**
 * @returns The Java configuration.
 */
export async function getJavaConfig(isFirstStartup: boolean): Promise<IJavaConfig> {

    // Do not add redhat.java extension to extensionDependencies in package.json,
    // because this extension will not start when redhat activation error occurs.
    const redhatExtension = vscode.extensions.getExtension('redhat.java');
    const availableNames = getAvailableNames(redhatExtension);
    const availableVers = availableNames.map(versionOf).filter(Boolean).sort((a, b) => a - b); // Number asc order
    const downloadLtsVers = availableVers.filter(isLtsVersion).slice(-4);
    const latestLtsVer = downloadLtsVers.at(-1) ?? 0;

    const javaConfig: IJavaConfig = {
        isFirstStartup,
        availableNames,
        availableVers,
        downloadLtsVers,
        latestAvailableVer: availableVers.at(-1) ?? 0,
        latestLtsVer,
        stableLtsVer: (latestLtsVer === availableVers.at(-1) ? downloadLtsVers.at(-2) : latestLtsVer) ?? 0,
        embeddedJreVer: await findEmbeddedJREVersion(redhatExtension),
    };
    Object.entries(javaConfig)
        .filter(([k]) => k !== Object.keys({ availableNames })[0])
        .forEach(([k, v]) => log.info(`JavaConfig ${k}: ${v}`))
        ;
    return javaConfig;
}

/**
 * @param ver The JDK major version.
 * @returns true if the given version is an LTS version.
 */
export function isLtsVersion(ver: number): boolean {
    return [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
}

async function findEmbeddedJREVersion(redhatExtension?: vscode.Extension<object>): Promise<number | undefined> {
    const redhatExtDir = redhatExtension?.extensionUri?.fsPath;
    if (redhatExtDir) {
        // C:\Users\(UserName)\.vscode\extensions\redhat.java-1.21.0-win32-x64\jre\17.0.7-win32-x86_64\bin
        const javaExePath = path.join(redhatExtDir, 'jre', '*', 'bin', jdkutils.JAVA_FILENAME);
        const javaExeFiles = await system.globSearch(javaExePath);
        if (javaExeFiles.length > 0) {
            const jreHomeDir = path.join(javaExeFiles[0], '..', '..');
            const utilRuntime = await jdkutils.getRuntime(jreHomeDir, { withVersion: true });
            return utilRuntime?.version?.major;
        }
    }
    // mac Parallels Windows Arm
    // redhat.java test version
    return undefined;
}

function getAvailableNames(redhatExtension?: vscode.Extension<object>): string[] {
    let config = redhatExtension?.packageJSON?.contributes?.configuration;
    if (Array.isArray(config)) {
        // 2023-12-1 (1.25 and later): Array
        // https://github.com/redhat-developer/vscode-java/pull/3386
        config = config.find(c => c.properties?.[JavaConfigRuntimes.CONFIG_NAME]);
    }
    const runtimeNames = config?.properties?.[JavaConfigRuntimes.CONFIG_NAME]?.items?.properties?.name?.enum ?? [];
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
export function versionOf(runtimeName: string): number {
    return Number(runtimeName.replace(/^J(ava|2)SE-(1\.|)/, ''));
}

/**
 * Returns the VS Code JDT runtime name that matches the given JDK major version.
 * @param majorVer The JDK major version.
 * @returns The VS Code JDT runtime name.
 */
export function nameOf(majorVer: number): string {
    if (majorVer <= 5) {
        return 'J2SE-1.' + majorVer;
    }
    if (majorVer <= 8) {
        return 'JavaSE-1.' + majorVer;
    }
    return 'JavaSE-' + majorVer;
}
