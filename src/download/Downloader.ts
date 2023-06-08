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
import * as autoContext from '../autoContext';
import { log } from '../autoContext';

export class Downloader {

    /** Remove leading directory components from extracted files. Default: 1 */
    removeLeadingPath:number = 1;

    constructor(
        private downloadUrl:string,
        private downloadedFile:string,
        private extractDestDir:string,
        private progress:vscode.Progress<any>,
        private targetMessage:string
    ) {
    }

    async execute() {
        await this.download();
        await this.extract();
    }

    private async download() {
        log.info(`Downloading ${this.targetMessage}...`, this.downloadUrl);
        const msg = `JDK Auto: ${l10n.t('Downloading')} ${this.targetMessage}`;
        this.progress.report({message: msg});
        const DOWNLOAD_MSG_KEY = 'DOWNLOAD_MSG_KEY';
        const workspaceState = autoContext.context.workspaceState;
        
        const res = await axios.get(this.downloadUrl, {responseType: 'stream'});
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
                this.progress.report({message: `${msg} (${percent}%)`});
            });
        }
        try {
            autoContext.mkdirSync(path.dirname(this.downloadedFile));
            const writer = fs.createWriteStream(this.downloadedFile);
            res.data.pipe(writer);
            await promisify(stream.finished)(writer);
        } finally {
            workspaceState.update(DOWNLOAD_MSG_KEY, undefined);
        }
    }

    private async extract() {
        log.info(`Installing ${this.targetMessage}...`, this.extractDestDir);
        this.progress.report({ message: `JDK Auto: ${l10n.t('Installing')} ${this.targetMessage}` });
        autoContext.rmSync(this.extractDestDir);
        try {
            await decompress(this.downloadedFile, this.extractDestDir, {strip: this.removeLeadingPath});
        } catch (e) {
            log.info('Failed extract: ' + e); // Validate later
        }
    }
}
