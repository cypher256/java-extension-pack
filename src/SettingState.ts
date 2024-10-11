/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
import * as fs from 'fs';
import * as system from './system';
import { log } from './system';

/**
 * Settings state class.
 * GlobalState cannot be applied instantly to multiple windows, so it is saved in a file.
 * OS-specific (e.g. WSL) considerations are not necessary, as the GlobalStorage destination varies by OS.
 */
export class SettingState {

	private constructor() {
		this.load();
	}

	/**
	 * Gets the SettingState instance.
	 * @returns The SettingState instance.
	 */
	static getInstance(): SettingState {
		return new SettingState();
	}

	/**
	 * Locks the update of the SettingState.
	 * @param callback The callback function.
	 * @returns The promise object.
	 */
	static async lockUpdate(callback: (state: SettingState) => Promise<void>) {
		const state = SettingState.getInstance();
		if (state.isEventProcessing || state.isDefaultProfileApplying) {
			return;
		}
		try {
			state.isEventProcessing = true;
			await callback(state);
		} finally {
			// Wait for another window event and MessageItem auto-close (2024.07.25 5s -> 3s)
			setTimeout(() => { state.isEventProcessing = false; }, 3_000);
		}
	}

	private readonly getStoreFile = () =>
		system.getGlobalStoragePath('.SettingState.json');

	private store(setter: () => void) {
		try {
			const oldJsonStr = this.load();
			setter();
			const newJsonStr = JSON.stringify(this);
			if (newJsonStr !== oldJsonStr) { // For performance
				fs.writeFileSync(this.getStoreFile(), newJsonStr); // Sync for catch
				log.debug('SettingState: store', newJsonStr);
			}
		} catch (e: unknown) {
			log.warn('SettingState: store', e);
		}
	}

	private load() {
		try {
			const jsonStr = system.readString(this.getStoreFile());
			Object.assign(this, JSON.parse(jsonStr || '{}')); // Copy fields
			return jsonStr;
		} catch (e: unknown) {
			log.warn('SettingState: load', e);
			return undefined;
		}
	}

	private _isDefaultProfileApplying?: boolean;
	get isDefaultProfileApplying() {
		const isApplying = !!this._isDefaultProfileApplying;
		log.debug(`SettingState: get isDefaultProfileApplying: ${isApplying}`);
		return isApplying;
	}
	set isDefaultProfileApplying(value: boolean) {
		this.store(() => this._isDefaultProfileApplying = value);
	}

	private _eventStartTime?: number;
	get isEventProcessing() {
		if (this._eventStartTime && Date.now() - this._eventStartTime > 60_000) {
			log.debug('SettingState: get isEventProcessing: Timeout');
			this.store(() => {
				this._eventStartTime = undefined;
				this._isDefaultProfileApplying = undefined;
			});
		}
		const isProcessing = !!this._eventStartTime;
		log.debug(`SettingState: get isEventProcessing: ${isProcessing}`);
		return isProcessing;
	}
	set isEventProcessing(value: boolean) {
		this.store(() => {
			this._eventStartTime = value ? Date.now() : undefined;
			log.debug(`SettingState: set isEventProcessing: ${value}`);
		});
	}

	private _originalProfileVersion?: number;
	get originalProfileVersion(): number | undefined {
		return this._originalProfileVersion;
	}
	set originalProfileVersion(value: number | undefined) {
		this.store(() => this._originalProfileVersion = value);
	}
}
