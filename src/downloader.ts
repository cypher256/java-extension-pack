/**
 * VSCode Java Extension Pack JDK Auto
 * Copyright (c) Shinji Kashihara.
 */
import axios from 'axios';
import * as decompress from 'decompress';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as autoContext from './autoContext';
import { log } from './autoContext';

/**
 * An interface for the options of the downloader.
 */
export interface IDownloaderOptions {
    readonly downloadUrl:string,
    readonly downloadedFile:string,
    readonly extractDestDir:string,
    readonly progress:vscode.Progress<any>,
    readonly targetMessage:string,
    removeLeadingArchive?:number,
    showDownloadMessage?:boolean // Currently unused always false
}

/**
 * Downloads and extracts for the given options.
 * @param opt The options of the downloader.
 * @returns opt argument.
 */
export async function execute(opt:IDownloaderOptions) {
    opt.removeLeadingArchive = opt.removeLeadingArchive ?? 1;
    await download(opt);
    await extract(opt);
    return opt;
}

async function download(opt:IDownloaderOptions) {
    log.info(`Downloading... ${opt.targetMessage}`, opt.downloadUrl);
    const DOWNLOAD_MSG_KEY = 'DOWNLOAD_MSG_KEY';
    const workspaceState = autoContext.context.workspaceState;
    const res = await axios.get(opt.downloadUrl, {responseType: 'stream'});

    if (opt.showDownloadMessage) {
        const msg = `JDK Auto: ${l10n.t('Downloading')}... ${opt.targetMessage}`;
        opt.progress.report({message: msg});
        const totalLength = res.headers['content-length'];
        if (totalLength) {
            let currentLength = 0;
            res.data.on('data', (chunk: Buffer) => {
                currentLength += chunk.length;
                const prevMsg = workspaceState.get(DOWNLOAD_MSG_KEY);
                if (prevMsg && prevMsg !== msg) {
                    return;
                }
                workspaceState.update(DOWNLOAD_MSG_KEY, msg);
                const percent = Math.floor((currentLength / totalLength) * 100);
                opt.progress.report({message: `${msg} (${percent}%)`});
            });
        }
    }
    try {
        autoContext.mkdirSyncQuietly(path.dirname(opt.downloadedFile));
        const writer = fs.createWriteStream(opt.downloadedFile);
        res.data.pipe(writer);
        await promisify(stream.finished)(writer);
    } finally {
        workspaceState.update(DOWNLOAD_MSG_KEY, undefined);
    }
}

async function extract(opt:IDownloaderOptions) {
    const procMessage = fs.existsSync(opt.extractDestDir) ? l10n.t('Updating') : l10n.t('Installing');
    log.info(`Installing... ${opt.targetMessage}`, opt.extractDestDir);
    opt.progress.report({ message: `JDK Auto: ${procMessage}... ${opt.targetMessage}` });
    autoContext.rmSyncQuietly(opt.extractDestDir);
    try {
        await decompress(opt.downloadedFile, opt.extractDestDir, {strip: opt.removeLeadingArchive});
    } catch (e) {
        log.info('Failed extract: ' + e); // Validate later
    }
}
