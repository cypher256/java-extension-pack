/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as system from './system';
import { log } from './system';
import decompress = require('decompress');
import _ = require('lodash');

/**
 * An interface for the HTTP client request.
 */
export interface IHttpClientRequest {
    url:string,
    readonly storeTempFile:string,
    readonly extractDestDir:string,
    readonly targetMessage:string,
    removeLeadingPath?:number,
    is404Ignore?:boolean,
}

/**
 * Downloads and extracts the file.
 * @param req The HTTP client request.
 * @returns A promise that resolves when the download and extract are completed.
 */
export async function get(req:IHttpClientRequest) {
    req.removeLeadingPath ??= 1;
    await vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
        try {
            await download(progress, req);
            await extract(progress, req);
		} catch (e:any) {
            // Silent: offline, 404, 503 proxy auth error, or etc.
            if (req.is404Ignore && e?.response?.status === 404) {
                // log.info(`Download skip ${opt.targetMessage}`);
                // return; // Update version file (Skip version, e.g. No Windows version)
                log.info(`Download 404 skip or waiting for build ${req.targetMessage}`);
            } else {
                log.info(`Download failed ${req.url}`, e);
            }
            throw e; // Do not update version file (Retry next time)
        }
    });
}

function report(progress:vscode.Progress<{message:string}>, msg:string) {
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

async function download(progress:vscode.Progress<{message:string}>, req:IHttpClientRequest) {
    log.info(`Download START ${req.targetMessage}`, req.url);
    const state = DownloadState.getInstance();
    const res = await axios.get(req.url, {responseType: 'stream'});

    const isFirstDownload = system.mkdirSyncQuietly(path.dirname(req.storeTempFile));
    if (isFirstDownload) {
        const msg = `${l10n.t('Downloading')}... ${req.targetMessage.replace(/[^A-z].*$/, '')}`;
        report(progress, msg);
        
        const totalLength = res.headers['content-length'];
        if (totalLength) {
            let currentLength = 0;
            
            res.data.on('data', async (chunk: Buffer) => {
                currentLength += chunk.length;
                if (state.extractingMsg) { // Prefer extracting message
                    report(progress, state.extractingMsg); // Update for Windows
                    return;
                }
                state.downloadingMsgs ??= [];
                if (!state.downloadingMsgs.includes(req.targetMessage)) {
                    state.downloadingMsgs.push(req.targetMessage);
                    await state.store();
                } else {
                    const percent = Math.floor((currentLength / totalLength) * 100);
                    report(progress, `${msg} (${percent}%)`);
                }
            });
        }
    }
    try {
        const writer = fs.createWriteStream(req.storeTempFile);
        res.data.pipe(writer);
        await promisify(stream.finished)(writer);
    } finally {
        state.downloadingMsgs ??= [];
        _.pull(state.downloadingMsgs, req.targetMessage);
        await state.store();
        log.info(`Download END ${req.targetMessage}`);
    }
}

async function extract(progress:vscode.Progress<{message:string}>, opt:IHttpClientRequest) {
    log.info(`Install START ${opt.targetMessage}`, opt.extractDestDir);
    const state = DownloadState.getInstance();
    try {
        const procLabel = system.existsDirectory(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
        const msg = `${procLabel}... ${opt.targetMessage}`;
        state.extractingMsg = msg;
        await state.store();
        report(progress, msg);
        system.rmSyncQuietly(opt.extractDestDir);
        try {
            await decompress(opt.storeTempFile, opt.extractDestDir, {strip: opt.removeLeadingPath});
            system.rmQuietly(opt.storeTempFile);
        } catch (e) {
            log.info('Failed extract:', e); // Validate later
        }
    } finally {
        state.extractingMsg = undefined;
        await state.store();
        log.info(`Install END ${opt.targetMessage}`);
    }
}
