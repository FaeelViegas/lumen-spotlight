import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SettingsManager } from './src/core/settings.js';
import { UsageTracker } from './src/core/usageTracker.js';
import { PluginManager } from './src/core/pluginManager.js';
import { FileIndexManager } from './src/core/index.js';
import { SearchEngine } from './src/core/searchEngine.js';
import { SearchWindow } from './src/ui/searchWindow.js';

import { AppsProvider } from './src/providers/apps.js';
import { FilesProvider } from './src/providers/files.js';
import { CalculatorProvider } from './src/providers/calc.js';
import { ConverterProvider } from './src/providers/convert.js';
import { DictionaryProvider } from './src/providers/dictionary.js';
import { ClipboardProvider } from './src/providers/clipboard.js';
import { SystemProvider } from './src/providers/system.js';
import { WindowsProvider } from './src/providers/windows.js';
import { WebSearchProvider } from './src/providers/web.js';
import { EmojiProvider } from './src/providers/emoji.js';
import { SnippetsProvider } from './src/providers/snippets.js';

/**
 * Ponto de entrada principal da extensão Lumen para GNOME Shell 50.1 (Wayland).
 * Segue rigorosamente o ciclo de vida `enable()` / `disable()`, pré-alocando a janela
 * para abertura em < 100 ms e limpando todos os sinais, atalhos, subprocessos e atores em `disable()`.
 */
export default class LumenExtension extends Extension {
    enable() {
        const rawSettings = this.getSettings();
        this._settingsManager = new SettingsManager(rawSettings);
        this._usageTracker = new UsageTracker(this._settingsManager);
        this._pluginManager = new PluginManager();

        this._fileIndexManager = new FileIndexManager(this._settingsManager, this.path);
        this._fileIndexManager.start();

        this._searchEngine = new SearchEngine(
            this._settingsManager,
            this._usageTracker,
            this._pluginManager
        );

        this._searchWindow = new SearchWindow(
            this._settingsManager,
            this._searchEngine,
            this._usageTracker
        );

        const copyFn = text => this._searchWindow?.copyTextToClipboard(text);

        // Registra provedores rápidos em memória (< 50 ms)
        this._searchEngine.registerProvider(new CalculatorProvider(copyFn), { isAsyncIO: false });
        this._searchEngine.registerProvider(
            new ConverterProvider(this._settingsManager, copyFn),
            { isAsyncIO: false }
        );
        this._searchEngine.registerProvider(new AppsProvider(), { isAsyncIO: false });
        this._searchEngine.registerProvider(new SystemProvider(), { isAsyncIO: false });
        this._searchEngine.registerProvider(new WindowsProvider(), { isAsyncIO: false });
        this._searchEngine.registerProvider(
            new DictionaryProvider(this._settingsManager, copyFn),
            { isAsyncIO: false }
        );
        this._searchEngine.registerProvider(
            new ClipboardProvider(this._settingsManager, copyFn),
            { isAsyncIO: false }
        );
        this._searchEngine.registerProvider(
            new WebSearchProvider(this._settingsManager),
            { isAsyncIO: false }
        );
        this._searchEngine.registerProvider(new EmojiProvider(copyFn), { isAsyncIO: false });
        this._searchEngine.registerProvider(
            new SnippetsProvider(this._settingsManager, copyFn),
            { isAsyncIO: false }
        );

        // Registra provedor assíncrono de I/O com debounce (Arquivos + Índice FTS5 / LocalSearch)
        this._searchEngine.registerProvider(
            new FilesProvider(this._fileIndexManager),
            { isAsyncIO: true }
        );

        // Carrega plugins externos em ~/.local/share/lumen/plugins/ e expõe API global segura
        this._pluginManager.loadUserPlugins();
        global.lumenPluginRegistry = {
            register: plugin => this._pluginManager?.registerPlugin(plugin),
            unregister: id => this._pluginManager?.unregisterPlugin(id),
        };

        this._registerGlobalKeybinding();
    }

    _registerGlobalKeybinding() {
        Main.wm.addKeybinding(
            'toggle-shortcut',
            this._settingsManager.raw,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => {
                this._searchWindow?.toggle();
            }
        );
    }

    disable() {
        Main.wm.removeKeybinding('toggle-shortcut');

        if (global.lumenPluginRegistry)
            delete global.lumenPluginRegistry;

        this._searchWindow?.destroy();
        this._searchWindow = null;

        this._searchEngine?.destroy();
        this._searchEngine = null;

        this._fileIndexManager?.destroy();
        this._fileIndexManager = null;

        this._pluginManager?.destroy();
        this._pluginManager = null;

        this._usageTracker?.destroy();
        this._usageTracker = null;

        this._settingsManager?.destroy();
        this._settingsManager = null;
    }
}
