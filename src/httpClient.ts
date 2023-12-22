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

const STATE_DOWNLOADING_MSG_STACK = 'STATE_DOWNLOADING_MSG_STACK';
const STATE_EXTRACTING_MSG = 'STATE_EXTRACTING_MSG';

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
export async function execute(req:IHttpClientRequest) {
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

async function download(progress:vscode.Progress<{message:string}>, req:IHttpClientRequest) {
    const workspaceState = system.getExtensionContext().workspaceState;
    const res = await axios.get(req.url, {responseType: 'stream'});
    log.info(`Download START ${req.targetMessage}`, req.url);

    const isFirstDownload = system.mkdirSyncQuietly(path.dirname(req.storeTempFile));
    if (isFirstDownload) {
        const msg = `${l10n.t('Downloading')}... ${req.targetMessage.replace(/[^A-z].*$/, '')}`;
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
                if (!msgStack.includes(req.targetMessage)) {
                    msgStack.push(req.targetMessage);
                    await workspaceState.update(STATE_DOWNLOADING_MSG_STACK, msgStack);
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
        const msgStack = workspaceState.get<string[]>(STATE_DOWNLOADING_MSG_STACK, []);
        _.pull(msgStack, req.targetMessage);
        await workspaceState.update(STATE_DOWNLOADING_MSG_STACK, msgStack);
        log.info(`Download END ${req.targetMessage}`);
    }
}

async function extract(progress:vscode.Progress<{message:string}>, opt:IHttpClientRequest) {
    log.info(`Install START ${opt.targetMessage}`, opt.extractDestDir);
    const workspaceState = system.getExtensionContext().workspaceState;
    try {
        const procLabel = system.existsDirectory(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
        const msg = `${procLabel}... ${opt.targetMessage}`;
        await workspaceState.update(STATE_EXTRACTING_MSG, msg);
        report(progress, msg);
        system.rmSyncQuietly(opt.extractDestDir);
        try {
            await decompress(opt.storeTempFile, opt.extractDestDir, {strip: opt.removeLeadingPath});
            system.rmQuietly(opt.storeTempFile);
        } catch (e) {
            log.info('Failed extract:', e); // Validate later
        }
    } finally {
        await workspaceState.update(STATE_EXTRACTING_MSG, undefined);
        log.info(`Install END ${opt.targetMessage}`);
    }
}
