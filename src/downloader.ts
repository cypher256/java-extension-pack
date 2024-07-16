/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import decompress from 'decompress';
import * as fs from 'fs';
import * as _ from "lodash";
import * as stream from 'stream';
import { setTimeout } from 'timers/promises';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as system from './system';
import { OS, log } from './system';

/**
 * An interface for the downloader request.
 */
export interface IDownloaderRequest {
    url: string,
    readonly localZipFile: string,
    readonly extractDestDir: string,
    readonly targetLabel: string,
    removeLeadingPath?: number,
}

/**
 * Downloads and extracts the file.
 * @param req The HTTP client request.
 * @returns A promise that resolves when the download and extract are completed.
 */
export async function execute(req: IDownloaderRequest) {
    await vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
        try {
            await download(progress, req);
            await extract(progress, req);
		} catch (e: any) {
            // Silent: offline, 404, 503 proxy auth error, or etc.
            log.info(`Download failed ${req.url}`, e);
            throw e; // Do not update version file (Retry next time)
        }
    });
}

function report(progress: vscode.Progress<{message: string}>, msg: string) {
    progress.report({message: `Auto Config Java: ${msg}`});
}

class DownloadState {

    downloadingMsgs: string[] | undefined;
    extractingMsg: string | undefined;
	private constructor() {}

	async store() { // Setter cannot be await
		const workspaceState = system.getExtensionContext().workspaceState;
		await workspaceState.update(DownloadState.name, this);
	}

	static getInstance() {
		const workspaceState = system.getExtensionContext().workspaceState;
		const state = Object.assign(new DownloadState(), workspaceState.get(DownloadState.name)); // Copy fields
		workspaceState.update(DownloadState.name, state);
		return state;
	}
}

async function download(progress: vscode.Progress<{message: string}>, req: IDownloaderRequest) {
    log.info(`Download START ${req.targetLabel}`, req.url);
    const state = DownloadState.getInstance();
    const isCreatedExtractDir = system.mkdirSyncQuietly(req.extractDestDir);
    const isShowProgressLaunchJson = process.env.VSCODE_AUTO_CONFIG_SHOW_PROGRESS === 'true';
    const res = await axios.get(req.url, {responseType: 'stream'});

    if (isCreatedExtractDir || isShowProgressLaunchJson) {
        const msg = `${l10n.t('Downloading')}... ${req.targetLabel.replace(/[^A-z].*$/, '')}`;
        report(progress, msg);
        
        const totalLength = res.headers['content-length'];
        if (totalLength) {
            let currentLength = 0;
            
            res.data.on('data', async (chunk: Buffer) => {
                currentLength += chunk.length;
                if (state.extractingMsg) { // Prefer extraction message
                    report(progress, state.extractingMsg);
                    return;
                }
                state.downloadingMsgs ??= [];
                if (!state.downloadingMsgs.includes(req.targetLabel)) {
                    state.downloadingMsgs.push(req.targetLabel);
                    await state.store();
                } else {
                    const percent = Math.floor((currentLength / totalLength) * 100);
                    report(progress, `${msg} (${percent}%)`);
                }
            });
        }
    }
    try {
        const writer = fs.createWriteStream(req.localZipFile); // Overwrite
        res.data.pipe(writer);
        await promisify(stream.finished)(writer);
    } finally {
        state.downloadingMsgs ??= [];
        _.pull(state.downloadingMsgs, req.targetLabel);
        await state.store();
        log.info(`Download END ${req.targetLabel}`);
    }
}

async function extract(progress: vscode.Progress<{message: string}>, opt: IDownloaderRequest) {
    log.info(`Extract START ${opt.targetLabel}`, opt.extractDestDir);
    const state = DownloadState.getInstance();
    try {
        const procLabel = system.existsDirectory(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
        const msg = `${procLabel}... ${opt.targetLabel}`;
        state.extractingMsg = msg;
        await state.store();
        report(progress, msg);
        system.rmSyncQuietly(opt.extractDestDir);
        try {
            await decompress(opt.localZipFile, opt.extractDestDir, {strip: opt.removeLeadingPath ?? 1});
            system.rmQuietly(opt.localZipFile);
        } catch (e: any) {
            log.info('Failed extract:', e); // Validate later
            if (OS.isWindows) {
                await setTimeout(5_000); // Wait for Windows delayed writes (200ms x, 300ms o)
            }
        }
    } finally {
        state.extractingMsg = undefined;
        await state.store();
        log.info(`Extract END ${opt.targetLabel}`);
    }
}
