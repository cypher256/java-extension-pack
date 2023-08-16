/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as jdkutils from 'jdk-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as autoContext from './autoContext';
import { log } from './autoContext';

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
export class JavaConfigRuntimeArray extends Array<IJavaConfigRuntime> {
	
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static CONFIG_KEY = 'java.configuration.runtimes';

	/**
	 * Finds the default Java runtime configuration for the VS Code Java extension.
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findDefault(): IJavaConfigRuntime | undefined {
		return this.find(runtime => runtime.default);
	}

	/**
	 * Finds the Java runtime configuration for the VS Code Java extension.
	 * @param name The Java name to find. See nameOf(majorVer:number).
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findByName(name: string): IJavaConfigRuntime | undefined {
		return this.find(runtime => runtime.name === name);
	}

	/**
	 * Finds the Java runtime configuration for the VS Code Java extension.
	 * @param version The Java version to find.
	 * @returns A Java runtime object. If no entry exists, returns undefined.
	 */
	findByVersion(version: number): IJavaConfigRuntime | undefined {
		return this.findByName(nameOf(version));
	}
}

/**
 * An interface that represents the JDT supported Java versions.
 */
export interface IJdtSupport {
    readonly targetLtsVers: number[];
    readonly stableLtsVer: number;
    readonly embeddedJreVer?: number; // undefined: mac Parallels Windows Arm
}

/**
 * Returns the versions of the available VS Code JDT runtimes.
 * @returns IJdtSupport object.
 */
export async function getJdtSupport(): Promise<IJdtSupport> {
    const availableVers = getAvailableVersions();
    const ltsFilter = (ver:number) => [8, 11].includes(ver) || (ver >= 17 && (ver - 17) % 4 === 0);
    const targetLtsVers = availableVers.filter(ltsFilter).slice(-4);
    const latestLtsVer = targetLtsVers.at(-1);
    const jdtSupport:IJdtSupport = {
        targetLtsVers: targetLtsVers,
        stableLtsVer: (latestLtsVer === availableVers.at(-1) ? targetLtsVers.at(-2) : latestLtsVer) ?? 0,
        embeddedJreVer: await findEmbeddedJREVersion(),
    };
    log.info('Supported Java', availableVers);
    log.info(`Target LTS [${targetLtsVers}] Stable ${jdtSupport.stableLtsVer}, ` +
        `LS Embedded JRE ${jdtSupport.embeddedJreVer}`);
    return jdtSupport;
}

async function findEmbeddedJREVersion(): Promise<number | undefined> {
    const redhatExtDir = getRedhatJavaExtension()?.extensionUri?.fsPath;
    if (redhatExtDir) {
        // C:\Users\(UserName)\.vscode\extensions\redhat.java-1.21.0-win32-x64
        // C:\Users\(UserName)\.vscode\extensions\redhat.java-1.21.0-win32-x64\jre\17.0.7-win32-x86_64\bin
        const javaExePath = path.join(redhatExtDir, 'jre', '*', 'bin', jdkutils.JAVA_FILENAME);
        const javaExeFiles = await autoContext.globSearch(javaExePath);
        if (javaExeFiles.length > 0) {
            const jreHomeDir = path.join(javaExeFiles[0], '..', '..');
            const runtime = await jdkutils.getRuntime(jreHomeDir, { withVersion: true });
            return runtime?.version?.major;
        }
    }
    return undefined;
}

function getRedhatJavaExtension(): vscode.Extension<any> | undefined {
    return vscode.extensions.getExtension('redhat.java');
}

/**
 * Returns the names of the available VS Code JDT runtimes.
 * @returns The VS Code JDT runtime names. An array of length 0 if not available.
 */
export function getAvailableNames(): string[] {
    // Do not add redhat.java extension to extensionDependencies in package.json,
    // because this extension will not start when redhat activation error occurs.
    const redhatJava = getRedhatJavaExtension();
    const redhatProp = redhatJava?.packageJSON?.contributes?.configuration?.properties;
    const runtimeNames = redhatProp?.[JavaConfigRuntimeArray.CONFIG_KEY]?.items?.properties?.name?.enum ?? [];
    if (runtimeNames.length === 0) {
        log.warn('Failed getExtension RedHat', redhatJava);
    }
    return runtimeNames;
}

/**
 * Returns the versions of the available VS Code JDT runtimes.
 * @returns The VS Code JDT runtime versions. An array of length 0 if not available.
 */
export function getAvailableVersions(): number[] {
    return getAvailableNames().map(versionOf).filter(Boolean).sort((a,b) => a-b);
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
    } else if (majorVer <= 8) {
        return 'JavaSE-1.' + majorVer;
    }
    return 'JavaSE-' + majorVer;
}