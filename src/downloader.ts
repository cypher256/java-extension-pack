/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as autoContext from './autoContext';
import { log } from './autoContext';
import decompress = require('decompress');
import _ = require('lodash');

const STATE_DOWNLOADING_MSG_STACK = 'STATE_DOWNLOADING_MSG_STACK';
const STATE_EXTRACTING_MSG = 'STATE_EXTRACTING_MSG';

/**
 * An interface for the options of the downloader.
 */
export interface IDownloaderOptions {
    downloadUrl:string,
    readonly downloadedFile:string,
    readonly extractDestDir:string,
    readonly targetMessage:string,
    removeLeadingPath?:number,
    is404Ignore?:boolean,
}

/**
 * Downloads and extracts for the given options.
 * @param opt The options of the downloader.
 * @return A promise that resolves when the download and extract are completed.
 */
export async function execute(opt:IDownloaderOptions) {
    opt.removeLeadingPath = opt.removeLeadingPath ?? 1;
    await vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
        try {
            await download(progress, opt);
            await extract(progress, opt);
		} catch (e:any) {
            // Silent: offline, 404, 503 proxy auth error, or etc.
            if (opt.is404Ignore && e?.response?.status === 404) {
                // log.info(`Download skip ${opt.targetMessage}`);
                // return; // Update version file (Skip version, e.g. No Windows version)
                log.info(`Download 404 skip or waiting for build ${opt.targetMessage}`);
            } else {
                log.info(`Download failed ${opt.downloadUrl}`, e);
            }
            throw e; // Do not update version file (Retry next time)
        }
    });
}

function report(progress:vscode.Progress<{message:string}>, msg:string) {
    progress.report({message: `Auto Config Java: ${msg}`});
}

async function download(progress:vscode.Progress<{message:string}>, opt:IDownloaderOptions) {
    const workspaceState = autoContext.getContext().workspaceState;
    const res = await axios.get(opt.downloadUrl, {responseType: 'stream'});
    log.info(`Download START ${opt.targetMessage}`, opt.downloadUrl);

    const isFirstDownload = autoContext.mkdirSyncQuietly(path.dirname(opt.downloadedFile));
    if (isFirstDownload) {
        const msg = `${l10n.t('Downloading')}... ${opt.targetMessage.replace(/[^A-z].*$/, '')}`;
        report(progress, msg);
        
        const totalLength = res.headers['content-length'];
        if (totalLength) {
            let currentLength = 0;
            
            res.data.on('data', async (chunk: Buffer) => {
                currentLength += chunk.length;
                const extractingMsg = workspaceState.get<string>(STATE_EXTRACTING_MSG);
                if (extractingMsg) { // Prefer extracting message
                    report(progress, extractingMsg); // Update for Windows
                    return;
                }
                let msgStack = workspaceState.get<string[]>(STATE_DOWNLOADING_MSG_STACK, []);
                if (!msgStack.includes(opt.targetMessage)) {
                    msgStack.push(opt.targetMessage);
                    await workspaceState.update(STATE_DOWNLOADING_MSG_STACK, msgStack);
                } else {
                    const percent = Math.floor((currentLength / totalLength) * 100);
                    report(progress, `${msg} (${percent}%)`);
                }
            });
        }
    }
    try {
        const writer = fs.createWriteStream(opt.downloadedFile);
        res.data.pipe(writer);
        await promisify(stream.finished)(writer);
    } finally {
        const msgStack = workspaceState.get<string[]>(STATE_DOWNLOADING_MSG_STACK, []);
        _.pull(msgStack, opt.targetMessage);
        await workspaceState.update(STATE_DOWNLOADING_MSG_STACK, msgStack);
        log.info(`Download END ${opt.targetMessage}`);
    }
}

async function extract(progress:vscode.Progress<{message:string}>, opt:IDownloaderOptions) {
    log.info(`Install START ${opt.targetMessage}`, opt.extractDestDir);
    const workspaceState = autoContext.getContext().workspaceState;
    try {
        const procLabel = autoContext.existsDirectory(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
        const msg = `${procLabel}... ${opt.targetMessage}`;
        await workspaceState.update(STATE_EXTRACTING_MSG, msg);
        report(progress, msg);
        autoContext.rmSyncQuietly(opt.extractDestDir);
        try {
            await decompress(opt.downloadedFile, opt.extractDestDir, {strip: opt.removeLeadingPath});
            autoContext.rmQuietly(opt.downloadedFile);
        } catch (e) {
            log.info('Failed extract:', e); // Validate later
        }
    } finally {
        await workspaceState.update(STATE_EXTRACTING_MSG, undefined);
        log.info(`Install END ${opt.targetMessage}`);
    }
}
