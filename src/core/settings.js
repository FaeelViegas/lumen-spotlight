import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const AVAILABLE_THEMES = [
    { id: 'spotlight-dark', name: 'Padrão (Spotlight Dark)', isLight: false },
    { id: 'liquid-glass', name: 'Liquid Glass', isLight: false, isLiquidGlass: true },
    { id: 'crystal-light', name: 'Cristal (Light)', isLight: true },
    { id: 'obsidian-oled', name: 'Obsidian (OLED Preto Puro)', isLight: false },
    { id: 'nord-frost', name: 'Nord Frost (Azul Ártico)', isLight: false },
    { id: 'catppuccin-mocha', name: 'Catppuccin Mocha (Suave)', isLight: false },
];

/**
 * Gerenciador centralizado de configurações e detecção de conflitos de atalho.
 * Compatível tanto com o processo do GNOME Shell (extension.js) quanto com o GTK4 (prefs.js).
 */
export class SettingsManager {
    constructor(settings) {
        this._settings = settings;
        this._signalIds = [];
    }

    get raw() {
        return this._settings;
    }

    connectChanged(key, callback) {
        const signalName = key ? `changed::${key}` : 'changed';
        const id = this._settings.connect(signalName, callback);
        this._signalIds.push(id);
        return id;
    }

    getToggleShortcuts() {
        return this._settings.get_strv('toggle-shortcut');
    }

    setToggleShortcuts(shortcuts) {
        this._settings.set_strv('toggle-shortcut', shortcuts);
    }

    getThemePreset() {
        const val = this._settings.get_string('theme-preset') || 'spotlight-dark';
        if (val === 'ios26-liquid-glass')
            return 'liquid-glass';
        return val;
    }

    setThemePreset(themeId) {
        this._settings.set_string('theme-preset', themeId);
    }

    getSearchFontSize() {
        return this._settings.get_int('search-font-size') || 17;
    }

    getWindowWidth() {
        return this._settings.get_int('window-width') || 680;
    }

    getBorderRadius() {
        return this._settings.get_int('border-radius') || 16;
    }

    getBlurMode() {
        return this._settings.get_string('blur-mode');
    }

    getMonitorBehavior() {
        return this._settings.get_string('monitor-behavior');
    }

    getShowPreviewPanel() {
        return this._settings.get_boolean('show-preview-panel');
    }

    getMaxResults() {
        return this._settings.get_int('max-results');
    }

    getDebounceMs() {
        return this._settings.get_int('debounce-ms');
    }

    getRawSearchDirectories() {
        return this._settings.get_strv('search-directories');
    }

    setRawSearchDirectories(dirs) {
        this._settings.set_strv('search-directories', dirs);
    }

    getSearchDirectories() {
        const rawDirs = this._settings.get_strv('search-directories');
        const homeDir = GLib.get_home_dir();
        return rawDirs.map(dir => {
            if (dir === '~')
                return homeDir;
            if (dir.startsWith('~/'))
                return GLib.build_filenamev([homeDir, dir.slice(2)]);
            return dir;
        });
    }

    getExcludedDirectories() {
        return this._settings.get_strv('excluded-directories');
    }

    setExcludedDirectories(dirs) {
        this._settings.set_strv('excluded-directories', dirs);
    }

    getHideCodeFiles() {
        return this._settings.get_boolean('hide-code-files');
    }

    setHideCodeFiles(hide) {
        this._settings.set_boolean('hide-code-files', hide);
    }

    getExcludedFileExtensions() {
        return this._settings.get_strv('excluded-file-extensions');
    }

    setExcludedFileExtensions(exts) {
        this._settings.set_strv('excluded-file-extensions', exts);
    }

    getEnableFileContentSearch() {
        return this._settings.get_boolean('enable-file-content-search');
    }

    getEnableClipboardHistory() {
        return this._settings.get_boolean('enable-clipboard-history');
    }

    getClipboardMaxItems() {
        return this._settings.get_int('clipboard-max-items');
    }

    getClipboardExcludedApps() {
        return this._settings.get_strv('clipboard-excluded-apps');
    }

    setClipboardExcludedApps(apps) {
        this._settings.set_strv('clipboard-excluded-apps', apps);
    }

    getEnableOnlineCurrency() {
        return this._settings.get_boolean('enable-online-currency');
    }

    getEnableOnlineDictionary() {
        return this._settings.get_boolean('enable-online-dictionary');
    }

    getEnableWebSearch() {
        return this._settings.get_boolean('enable-web-search');
    }

    getWebSearchEngines() {
        try {
            return JSON.parse(this._settings.get_string('web-search-engines'));
        } catch {
            return {};
        }
    }

    setWebSearchEngines(enginesObj) {
        this._settings.set_string('web-search-engines', JSON.stringify(enginesObj));
    }

    getCustomSnippets() {
        try {
            return JSON.parse(this._settings.get_string('custom-snippets'));
        } catch {
            return [];
        }
    }

    setCustomSnippets(snippets) {
        this._settings.set_string('custom-snippets', JSON.stringify(snippets));
    }

    checkInputSourceShortcutConflict() {
        const currentShortcuts = this.getToggleShortcuts();
        const usesSuperSpace = currentShortcuts.some(
            s => s.toLowerCase() === '<super>space'
        );

        if (!usesSuperSpace)
            return { hasConflict: false, conflictingKey: null, suggestedAlternative: '<Alt>space' };

        try {
            const wmSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.wm.keybindings',
            });
            const switchSourceBindings = [
                ...wmSettings.get_strv('switch-input-source'),
                ...wmSettings.get_strv('switch-input-source-backward'),
            ];

            const conflict = switchSourceBindings.find(
                b => b.toLowerCase() === '<super>space'
            );

            return {
                hasConflict: Boolean(conflict),
                conflictingKey: conflict || null,
                suggestedAlternative: '<Alt>space',
            };
        } catch {
            return { hasConflict: false, conflictingKey: null, suggestedAlternative: '<Alt>space' };
        }
    }

    applySuggestedAlternativeShortcut() {
        this.setToggleShortcuts(['<Alt>space']);
        this._settings.set_boolean('conflict-warning-dismissed', true);
    }

    destroy() {
        for (const id of this._signalIds)
            this._settings.disconnect(id);
        this._signalIds = [];
        this._settings = null;
    }
}
