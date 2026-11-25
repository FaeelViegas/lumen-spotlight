import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { AVAILABLE_THEMES, SettingsManager } from './src/core/settings.js';

/**
 * Janela de Preferências amigável e 100% visual em GTK4 + libadwaita (Adw).
 * Substitui entradas de texto brutas ou JSON por:
 * - Gravador interativo de atalho de teclado ("Clique e pressione as teclas") + Presets rápidos
 * - Seletor de Temas Premium e controles de tipografia/dimensões em tempo real
 * - Seletor nativo de pastas (Gtk.FileDialog) e lista visual com botões de remoção
 * - Editor visual de Snippets e Motores de Busca Web (Adw.ExpanderRow)
 */
export default class LumenPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(760, 680);
        window.set_search_enabled(true);

        const rawSettings = this.getSettings();
        const settingsMgr = new SettingsManager(rawSettings);

        this._addAppearanceAndShortcutPage(window, rawSettings, settingsMgr);
        this._addFilesAndIndexingPage(window, rawSettings, settingsMgr);
        this._addSnippetsAndWebVisualPage(window, rawSettings, settingsMgr);
        this._addPrivacyPage(window, rawSettings, settingsMgr);
    }

    _addAppearanceAndShortcutPage(window, rawSettings, settingsMgr) {
        const page = new Adw.PreferencesPage({
            title: _('Aparência e Atalho'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        // 1. Gravador Interativo de Atalho de Teclado
        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Atalho Global de Teclado'),
            description: _('Grave qualquer combinação pressionando as teclas ou escolha uma sugestão abaixo.'),
        });

        const currentShortcutRow = new Adw.ActionRow({
            title: _('Tecla de Ativação Atual'),
            subtitle: _('Clique em "Gravar Atalho" e pressione a combinação desejada'),
        });

        const currentAccelStr = settingsMgr.getToggleShortcuts()[0] || '<Control><Alt>s';
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: currentAccelStr,
            disabled_text: _('Desativado'),
            valign: Gtk.Align.CENTER,
        });

        const recordBtn = new Gtk.Button({
            label: _('Gravar Atalho…'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });

        recordBtn.connect('clicked', () => {
            this._openShortcutCaptureDialog(window, settingsMgr, newAccel => {
                shortcutLabel.set_accelerator(newAccel);
            });
        });

        currentShortcutRow.add_suffix(shortcutLabel);
        currentShortcutRow.add_suffix(recordBtn);
        shortcutGroup.add(currentShortcutRow);

        // Presets de 1 clique
        const presetsRow = new Adw.ActionRow({
            title: _('Atalhos Rápidos Recomendados'),
            subtitle: _('Aplique com 1 clique sem precisar digitar códigos'),
        });

        const presetsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });

        const presets = [
            { label: 'Ctrl+Alt+S', accel: '<Control><Alt>s' },
            { label: 'Alt+Espaço', accel: '<Alt>space' },
            { label: 'Super+Espaço', accel: '<Super>space' },
            { label: 'Ctrl+Espaço', accel: '<Control>space' },
        ];

        for (const p of presets) {
            const btn = new Gtk.Button({
                label: p.label,
                css_classes: ['flat'],
            });
            btn.connect('clicked', () => {
                settingsMgr.setToggleShortcuts([p.accel]);
                shortcutLabel.set_accelerator(p.accel);
            });
            presetsBox.append(btn);
        }

        presetsRow.add_suffix(presetsBox);
        shortcutGroup.add(presetsRow);
        page.add(shortcutGroup);

        // 2. Temas e Personalização Visual da Barra
        const themeGroup = new Adw.PreferencesGroup({
            title: _('Temas e Estilo da Barra de Pesquisa'),
            description: _('Escolha um tema visual e ajuste o tamanho da fonte, largura e bordas em tempo real.'),
        });

        const themeNames = AVAILABLE_THEMES.map(t => _(t.name));
        const themeIds = AVAILABLE_THEMES.map(t => t.id);
        const themeCombo = new Adw.ComboRow({
            title: _('Tema da Interface'),
            subtitle: _('Altera cores de superfície, contraste e destaque do item selecionado'),
            model: Gtk.StringList.new(themeNames),
            selected: Math.max(0, themeIds.indexOf(settingsMgr.getThemePreset())),
        });
        themeCombo.connect('notify::selected', () => {
            settingsMgr.setThemePreset(themeIds[themeCombo.selected] || 'spotlight-dark');
        });
        themeGroup.add(themeCombo);

        const fontSpin = new Adw.SpinRow({
            title: _('Tamanho da Fonte da Pesquisa (px)'),
            subtitle: _('Padrão refinado: 17 px (menor que os 22 px originais)'),
            adjustment: new Gtk.Adjustment({
                lower: 13,
                upper: 26,
                step_increment: 1,
                value: settingsMgr.getSearchFontSize(),
            }),
        });
        rawSettings.bind('search-font-size', fontSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(fontSpin);

        const widthSpin = new Adw.SpinRow({
            title: _('Largura da Janela (px)'),
            subtitle: _('Largura horizontal da barra do Lumen (520 a 960 px)'),
            adjustment: new Gtk.Adjustment({
                lower: 520,
                upper: 960,
                step_increment: 20,
                value: settingsMgr.getWindowWidth(),
            }),
        });
        rawSettings.bind('window-width', widthSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(widthSpin);

        const radiusSpin = new Adw.SpinRow({
            title: _('Arredondamento dos Cantos (px)'),
            subtitle: _('Curvatura das bordas externas da janela (8 a 28 px)'),
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 28,
                step_increment: 2,
                value: settingsMgr.getBorderRadius(),
            }),
        });
        rawSettings.bind('border-radius', radiusSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(radiusSpin);

        const blurModel = Gtk.StringList.new([
            _('Híbrido (Desfoque Real + Fallback Automático)'),
            _('Sempre Usar Desfoque em Tempo Real'),
            _('Apenas Translucidez Acrílica CSS'),
        ]);
        const blurValues = ['hybrid', 'always', 'css-only'];
        const blurRow = new Adw.ComboRow({
            title: _('Efeito de Desfoque (Backdrop Blur)'),
            subtitle: _('Controla o shader de desfoque sob a janela'),
            model: blurModel,
            selected: Math.max(0, blurValues.indexOf(settingsMgr.getBlurMode())),
        });
        blurRow.connect('notify::selected', () => {
            rawSettings.set_string('blur-mode', blurValues[blurRow.selected] || 'hybrid');
        });
        themeGroup.add(blurRow);

        const monitorModel = Gtk.StringList.new([
            _('Monitor com o Cursor do Mouse'),
            _('Monitor da Janela em Foco'),
            _('Sempre no Monitor Principal'),
        ]);
        const monitorValues = ['pointer', 'active-window', 'primary'];
        const monitorRow = new Adw.ComboRow({
            title: _('Posicionamento Multi-Monitor'),
            model: monitorModel,
            selected: Math.max(0, monitorValues.indexOf(settingsMgr.getMonitorBehavior())),
        });
        monitorRow.connect('notify::selected', () => {
            rawSettings.set_string('monitor-behavior', monitorValues[monitorRow.selected] || 'pointer');
        });
        themeGroup.add(monitorRow);

        const previewRow = new Adw.SwitchRow({
            title: _('Exibir Painel de Pré-visualização Lateral'),
            subtitle: _('Mostra resumo do aplicativo, imagem, código ou metadados à direita'),
        });
        rawSettings.bind('show-preview-panel', previewRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(previewRow);

        const maxResultsRow = new Adw.SpinRow({
            title: _('Máximo de Resultados Visíveis'),
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 25,
                step_increment: 1,
                value: settingsMgr.getMaxResults(),
            }),
        });
        rawSettings.bind('max-results', maxResultsRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(maxResultsRow);

        page.add(themeGroup);
        window.add(page);
    }

    _openShortcutCaptureDialog(parentWindow, settingsMgr, onCaptured) {
        const dialog = new Gtk.Window({
            title: _('Pressione o Novo Atalho'),
            transient_for: parentWindow,
            modal: true,
            default_width: 420,
            default_height: 210,
            resizable: false,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_top: 28,
            margin_bottom: 28,
            margin_start: 28,
            margin_end: 28,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        const titleLbl = new Gtk.Label({
            label: _('<b>Pressione a combinação de teclas desejada</b>'),
            use_markup: true,
        });
        const subLbl = new Gtk.Label({
            label: _('Exemplo: Ctrl + Alt + S ou Alt + Espaço.\nPressione Backspace para limpar ou Esc para cancelar.'),
            justify: Gtk.Justification.CENTER,
        });

        box.append(titleLbl);
        box.append(subLbl);
        dialog.set_child(box);

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_ctrl, keyval, keycode, state) => {
            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            // Ignora pressionamento isolado de teclas modificadoras
            const isModifierOnly = [
                Gdk.KEY_Control_L, Gdk.KEY_Control_R,
                Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
                Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
                Gdk.KEY_Super_L, Gdk.KEY_Super_R,
                Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
            ].includes(keyval);

            if (isModifierOnly)
                return Gdk.EVENT_PROPAGATE;

            const mask = state & Gtk.accelerator_get_default_mod_mask();
            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            if (accel) {
                settingsMgr.setToggleShortcuts([accel]);
                onCaptured?.(accel);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        dialog.add_controller(controller);
        dialog.present();
    }

    _addFilesAndIndexingPage(window, rawSettings, settingsMgr) {
        const page = new Adw.PreferencesPage({
            title: _('Pastas e Busca'),
            icon_name: 'folder-saved-search-symbolic',
        });

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Motor de Indexação de Documentos'),
            description: _('A busca prioriza documentos e pastas pessoais antes de subpastas profundas.'),
        });

        const contentSwitch = new Adw.SwitchRow({
            title: _('Pesquisar Também Dentro do Conteúdo de Arquivos'),
            subtitle: _('Indexa textos, relatórios, Markdown e configurações no banco local FTS5'),
        });
        rawSettings.bind('enable-file-content-search', contentSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(contentSwitch);

        const hideCodeSwitch = new Adw.SwitchRow({
            title: _('Ocultar Arquivos de Programação por Padrão (.py, .cs, .js, .ts, .json…)'),
            subtitle: _('Foca resultados em documentos (.pdf, .docx, .xlsx, .odt, .txt, imagens). Você ainda pode buscar código usando "kind:code"'),
        });
        rawSettings.bind('hide-code-files', hideCodeSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(hideCodeSwitch);

        const extsExpander = new Adw.ExpanderRow({
            title: _('Extensões de Código e Sistema Ocultadas'),
            subtitle: _('Clique para visualizar ou personalizar quais extensões ficam ocultas por padrão'),
        });

        const extsEntry = new Adw.EntryRow({
            title: _('Extensões (separadas por vírgula)'),
            text: settingsMgr.getExcludedFileExtensions().join(', '),
            show_apply_button: true,
        });
        extsEntry.connect('apply', () => {
            const list = extsEntry
                .get_text()
                .split(',')
                .map(s => {
                    const t = s.trim().toLowerCase();
                    if (!t)
                        return '';
                    return t.startsWith('.') ? t : `.${t}`;
                })
                .filter(Boolean);
            settingsMgr.setExcludedFileExtensions(list);
        });
        extsExpander.add_row(extsEntry);
        behaviorGroup.add(extsExpander);

        const reindexRow = new Adw.ActionRow({
            title: _('Reconstruir Índice de Documentos Agora'),
            subtitle: _('Limpa e atualiza o banco SQLite FTS5 caso você tenha movido muitos arquivos'),
        });
        const reindexBtn = new Gtk.Button({
            label: _('Reindexar Agora'),
            valign: Gtk.Align.CENTER,
        });
        reindexBtn.connect('clicked', () => {
            try {
                const cacheDb = GLib.build_filenamev([GLib.get_user_cache_dir(), 'lumen', 'files-fts5.sqlite']);
                const daemonScript = GLib.build_filenamev([this.path, 'src', 'core', 'indexerDaemon.py']);
                const proc = Gio.Subprocess.new(
                    ['python3', '-u', daemonScript, cacheDb],
                    Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE
                );
                const payload = JSON.stringify({
                    id: 1,
                    action: 'sync',
                    directories: settingsMgr.getSearchDirectories(),
                    excluded: settingsMgr.getExcludedDirectories(),
                    includeContent: settingsMgr.getEnableFileContentSearch(),
                }) + '\n';
                proc.communicate_utf8_async(payload, null, () => {
                    reindexRow.set_subtitle(_('Índice reconstruído com sucesso!'));
                    proc.force_exit();
                });
            } catch {
                reindexRow.set_subtitle(_('Erro ao iniciar reindexação.'));
            }
        });
        reindexRow.add_suffix(reindexBtn);
        behaviorGroup.add(reindexRow);
        page.add(behaviorGroup);

        // Lista visual de pastas indexadas com Seletor Nativo (Gtk.FileDialog)
        const dirsGroup = new Adw.PreferencesGroup({
            title: _('Pastas Incluídas na Busca'),
            description: _('Adicione ou remova pastas com 1 clique (sem precisar digitar caminhos).'),
        });

        const addFolderBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            label: _('Adicionar Pasta…'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });

        dirsGroup.set_header_suffix(addFolderBtn);

        const folderRows = [];
        const rebuildFoldersList = () => {
            for (const r of folderRows)
                dirsGroup.remove(r);
            folderRows.length = 0;

            const currentDirs = settingsMgr.getRawSearchDirectories();
            for (const dirPath of currentDirs) {
                const row = new Adw.ActionRow({
                    title: dirPath,
                    icon_name: 'folder-symbolic',
                });
                const removeBtn = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Remover pasta'),
                });
                removeBtn.connect('clicked', () => {
                    const updated = settingsMgr.getRawSearchDirectories().filter(d => d !== dirPath);
                    settingsMgr.setRawSearchDirectories(updated.length > 0 ? updated : ['~']);
                    rebuildFoldersList();
                });
                row.add_suffix(removeBtn);
                dirsGroup.add(row);
                folderRows.push(row);
            }
        };

        addFolderBtn.connect('clicked', () => {
            const fileDialog = new Gtk.FileDialog({
                title: _('Selecionar Pasta para Indexar'),
                modal: true,
            });
            fileDialog.select_folder(window, null, (dlg, res) => {
                try {
                    const folderFile = dlg.select_folder_finish(res);
                    const path = folderFile?.get_path();
                    if (!path)
                        return;
                    const home = GLib.get_home_dir();
                    const pretty = path === home
                        ? '~'
                        : (path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path);

                    const current = settingsMgr.getRawSearchDirectories();
                    if (!current.includes(pretty)) {
                        settingsMgr.setRawSearchDirectories([pretty, ...current]);
                        rebuildFoldersList();
                    }
                } catch {
                    // Cancelado pelo usuário
                }
            });
        });

        rebuildFoldersList();
        page.add(dirsGroup);
        window.add(page);
    }

    _addSnippetsAndWebVisualPage(window, rawSettings, settingsMgr) {
        const page = new Adw.PreferencesPage({
            title: _('Snippets e Web'),
            icon_name: 'insert-text-symbolic',
        });

        // Editor visual de Snippets (Sem JSON manual!)
        const snipGroup = new Adw.PreferencesGroup({
            title: _('Snippets e Textos Rápidos'),
            description: _('Digite o gatilho (ex.: ;email) na barra do Lumen para copiar o texto instantaneamente.'),
        });

        const addSnipBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            label: _('Novo Snippet'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        snipGroup.set_header_suffix(addSnipBtn);

        const snippetRows = [];
        const rebuildSnippetsUI = () => {
            for (const r of snippetRows)
                snipGroup.remove(r);
            snippetRows.length = 0;

            const snippets = settingsMgr.getCustomSnippets();
            snippets.forEach((snip, idx) => {
                const expander = new Adw.ExpanderRow({
                    title: `${snip.title || 'Snippet'} (${snip.trigger || ';snip'})`,
                    subtitle: (snip.content || '').replace(/\s+/g, ' ').slice(0, 60),
                });

                const titleEntry = new Adw.EntryRow({
                    title: _('Nome do Snippet'),
                    text: snip.title || '',
                });
                const triggerEntry = new Adw.EntryRow({
                    title: _('Gatilho (ex.: ;email)'),
                    text: snip.trigger || '',
                });
                const contentEntry = new Adw.EntryRow({
                    title: _('Conteúdo Copiado'),
                    text: snip.content || '',
                });

                const saveChanges = () => {
                    const all = settingsMgr.getCustomSnippets();
                    all[idx] = {
                        title: titleEntry.get_text().trim() || 'Snippet',
                        trigger: triggerEntry.get_text().trim() || ';snip',
                        content: contentEntry.get_text(),
                        description: 'Snippet personalizado',
                    };
                    settingsMgr.setCustomSnippets(all);
                    expander.set_title(`${all[idx].title} (${all[idx].trigger})`);
                    expander.set_subtitle(all[idx].content.slice(0, 60));
                };

                titleEntry.connect('changed', saveChanges);
                triggerEntry.connect('changed', saveChanges);
                contentEntry.connect('changed', saveChanges);

                const deleteRow = new Adw.ActionRow({
                    title: _('Excluir este Snippet'),
                });
                const delBtn = new Gtk.Button({
                    label: _('Remover'),
                    valign: Gtk.Align.CENTER,
                    css_classes: ['destructive-action'],
                });
                delBtn.connect('clicked', () => {
                    const all = settingsMgr.getCustomSnippets();
                    all.splice(idx, 1);
                    settingsMgr.setCustomSnippets(all);
                    rebuildSnippetsUI();
                });
                deleteRow.add_suffix(delBtn);

                expander.add_row(titleEntry);
                expander.add_row(triggerEntry);
                expander.add_row(contentEntry);
                expander.add_row(deleteRow);

                snipGroup.add(expander);
                snippetRows.push(expander);
            });
        };

        addSnipBtn.connect('clicked', () => {
            const all = settingsMgr.getCustomSnippets();
            all.push({
                trigger: ';novo',
                title: 'Novo Atalho de Texto',
                content: 'Texto a ser copiado',
                description: 'Snippet personalizado',
            });
            settingsMgr.setCustomSnippets(all);
            rebuildSnippetsUI();
        });

        rebuildSnippetsUI();
        page.add(snipGroup);

        // Grupo de Busca na Web
        const webGroup = new Adw.PreferencesGroup({
            title: _('Atalhos de Busca na Web'),
            description: _('Use prefixos rápidos como "g linux", "yt música" ou "gh gnome-shell" na barra de busca.'),
        });

        const webSwitch = new Adw.SwitchRow({
            title: _('Habilitar Busca Rápida na Web por Prefixo'),
            subtitle: _('Abre o navegador padrão quando um prefixo (g, ddg, yt, gh, wiki) é utilizado'),
        });
        rawSettings.bind('enable-web-search', webSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        webGroup.add(webSwitch);

        page.add(webGroup);
        window.add(page);
    }

    _addPrivacyPage(window, rawSettings, _settingsMgr) {
        const page = new Adw.PreferencesPage({
            title: _('Privacidade'),
            icon_name: 'security-high-symbolic',
        });

        const clipGroup = new Adw.PreferencesGroup({
            title: _('Área de Transferência e Dados Locais'),
            description: _('O Lumen opera 100% offline por padrão, sem telemetria.'),
        });

        const clipSwitch = new Adw.SwitchRow({
            title: _('Histórico da Área de Transferência (Opt-in)'),
            subtitle: _('Armazena cópias recentes apenas na memória RAM, ignorando apps de senhas'),
        });
        rawSettings.bind('enable-clipboard-history', clipSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        clipGroup.add(clipSwitch);

        const currencySwitch = new Adw.SwitchRow({
            title: _('Atualizar Cotações de Moedas via Internet (Opt-in)'),
            subtitle: _('Quando desativado, utiliza exclusivamente o cache offline local'),
        });
        rawSettings.bind('enable-online-currency', currencySwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        clipGroup.add(currencySwitch);

        const clearStatsRow = new Adw.ActionRow({
            title: _('Histórico de Aprendizado e Ranking'),
            subtitle: _('Zera a contagem de aplicativos e arquivos mais abertos'),
        });
        const clearBtn = new Gtk.Button({
            label: _('Limpar Histórico'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        clearBtn.connect('clicked', () => {
            rawSettings.set_string('usage-stats', '{}');
            clearStatsRow.set_subtitle(_('Histórico de frequência reiniciado!'));
        });
        clearStatsRow.add_suffix(clearBtn);
        clipGroup.add(clearStatsRow);

        page.add(clipGroup);
        window.add(page);
    }
}
