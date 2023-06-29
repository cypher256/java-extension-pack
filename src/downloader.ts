/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
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

const STATE_MSG_STACK = 'STATE_MSG_STACK';
const STATE_IS_EXTRACTING = 'STATE_IS_EXTRACTING';

/**
 * An interface for the options of the downloader.
 */
export interface IDownloaderOptions {
    readonly downloadUrl:string,
    readonly downloadedFile:string,
    readonly extractDestDir:string,
    readonly targetMessage:string,
    removeLeadingPath?:number,
}

/**
 * Downloads and extracts for the given options.
 * @param opt The options of the downloader.
 * @return opt argument.
 */
export async function execute(opt:IDownloaderOptions) {
    opt.removeLeadingPath = opt.removeLeadingPath ?? 1;
    await vscode.window.withProgress({location: vscode.ProgressLocation.Window}, async progress => {
        await download(progress, opt);
        await extract(progress, opt);
    });
    return opt;
}

async function download(progress:vscode.Progress<{message:string}>, opt:IDownloaderOptions) {
    log.info(`Download START ${opt.targetMessage}`, opt.downloadUrl);
    const workspaceState = autoContext.context.workspaceState;
    const res = await axios.get(opt.downloadUrl, {responseType: 'stream'});

    const isFirstDownload = autoContext.mkdirSyncQuietly(path.dirname(opt.downloadedFile));
    if (isFirstDownload) {
        const msg = `JDK Auto: ${l10n.t('Downloading')}... ${opt.targetMessage}`;
        progress.report({message: msg});
        const totalLength = res.headers['content-length'];
        if (totalLength) {
            let currentLength = 0;
            res.data.on('data', async (chunk: Buffer) => {
                currentLength += chunk.length;
                if (workspaceState.get(STATE_IS_EXTRACTING)) {
                    return;
                }
                let msgStack = workspaceState.get<string[]>(STATE_MSG_STACK, []);
                if (!msgStack.includes(opt.targetMessage)) {
                    msgStack.push(opt.targetMessage);
                    await workspaceState.update(STATE_MSG_STACK, msgStack);
                } else {
                    const percent = Math.floor((currentLength / totalLength) * 100);
                    progress.report({message: `${msg} (${percent}%)`});
                }
            });
        }
    }
    try {
        const writer = fs.createWriteStream(opt.downloadedFile);
        res.data.pipe(writer);
        await promisify(stream.finished)(writer);
    } finally {
        const msgStack = workspaceState.get<string[]>(STATE_MSG_STACK, []);
        _.pull(msgStack, opt.targetMessage);
        await workspaceState.update(STATE_MSG_STACK, msgStack);
        log.info(`Download END ${opt.targetMessage}`);
    }
}

async function extract(progress:vscode.Progress<{message:string}>, opt:IDownloaderOptions) {
    log.info(`Install START ${opt.targetMessage}`, opt.extractDestDir);
    const workspaceState = autoContext.context.workspaceState;
    try {
        await workspaceState.update(STATE_IS_EXTRACTING, true);
        const procMessage = fs.existsSync(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
        progress.report({ message: `JDK Auto: ${procMessage}... ${opt.targetMessage}` });
        autoContext.rmSyncQuietly(opt.extractDestDir);
        try {
            await decompress(opt.downloadedFile, opt.extractDestDir, {strip: opt.removeLeadingPath});
            autoContext.rmQuietly(opt.downloadedFile);
        } catch (e) {
            log.info('Failed extract: ' + e); // Validate later
        }
    } finally {
        await workspaceState.update(STATE_IS_EXTRACTING, undefined);
        log.info(`Install END ${opt.targetMessage}`);
    }
}
