import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { AVAILABLE_THEMES } from '../core/settings.js';
import { ResultRow, createCategoryHeader } from './resultRow.js';
import { PreviewPanel } from './preview.js';

const THEME_CLASS_NAMES = [
    ...AVAILABLE_THEMES.map(t => `lumen-theme-${t.id}`),
    'lumen-theme-ios26-liquid-glass',
];

/**
 * Janela principal flutuante do Lumen (GNOME Shell 50.1 Wayland).
 *
 * Correções críticas de estabilidade de sobreposição (Wayland Input Region):
 * - A janela só é anexada a `Main.layoutManager.uiGroup` enquanto estiver aberta (`show()`)
 *   e é removida imediatamente da árvore visual em `hide()`. Isso garante matematicamente
 *   que NENHUM ator invisível permaneça na camada superior do compositor bloqueando cliques ou Alt+Tab.
 * - Inclui animação elástica estilo **iOS 26 Liquid Glass** (`EASE_OUT_BACK`) e reflexo especular dinâmico.
 */
export class SearchWindow {
    constructor(settingsManager, searchEngine, usageTracker) {
        this._settings = settingsManager;
        this._searchEngine = searchEngine;
        this._usageTracker = usageTracker;

        this._isOpen = false;
        this._isAttachedToChrome = false;
        this._modalGrab = null;
        this._hideTimeoutId = 0;
        this._results = [];
        this._rows = [];
        this._categoryStartIndices = [];
        this._selectedIndex = 0;

        this._desktopInterfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        this._buildUI();
        this._bindEvents();
    }

    _buildUI() {
        this._backdrop = new St.Widget({
            name: 'lumen-backdrop',
            style_class: 'lumen-backdrop',
            reactive: true,
            visible: false,
            x: 0,
            y: 0,
        });

        this._dialog = new St.BoxLayout({
            name: 'lumen-dialog',
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-dialog',
            reactive: true,
            can_focus: true,
            track_hover: true,
            clip_to_allocation: true,
        });
        this._dialog.accessible_role = Atk.Role.DIALOG;
        this._dialog.accessible_name = 'Lumen Spotlight Search';
        this._dialog.set_pivot_point(0.5, 0.25);

        // Faixa de reflexo especular superior (exclusiva para o visual Liquid Glass iOS 26)
        this._specularHighlight = new St.Widget({
            style_class: 'lumen-liquid-specular-bar',
            x_expand: true,
            height: 1,
        });
        this._dialog.add_child(this._specularHighlight);

        this._conflictBanner = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lumen-conflict-banner',
            visible: false,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._conflictLabel = new St.Label({
            text: 'Conflito detectado: Super+Espaço também está associado à troca de layout de teclado do Ubuntu.',
            style_class: 'lumen-conflict-text',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._conflictBanner.add_child(this._conflictLabel);

        this._conflictActionBtn = new St.Button({
            label: 'Usar Alt+Espaço',
            style_class: 'lumen-conflict-btn',
            reactive: true,
            can_focus: true,
        });
        this._conflictBanner.add_child(this._conflictActionBtn);
        this._dialog.add_child(this._conflictBanner);

        // Barra superior de pesquisa
        this._entryRow = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lumen-entry-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._searchIcon = new St.Icon({
            icon_name: 'system-search-symbolic',
            style_class: 'lumen-search-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._entryRow.add_child(this._searchIcon);

        this._entry = new St.Entry({
            style_class: 'lumen-search-entry',
            hint_text: 'Pesquisar aplicativos, documentos, cálculos ou comandos…',
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._entry.accessible_role = Atk.Role.ENTRY;
        this._entry.accessible_name = 'Campo de busca do Lumen';
        this._entryRow.add_child(this._entry);

        this._latencyBadge = new St.Label({
            text: '',
            style_class: 'lumen-latency-badge',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._entryRow.add_child(this._latencyBadge);

        this._dialog.add_child(this._entryRow);

        // Área dividida: Lista de resultados à esquerda + Painel de pré-visualização à direita
        this._contentSplit = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lumen-content-split',
            x_expand: true,
            clip_to_allocation: true,
            visible: false,
        });

        this._scrollView = new St.ScrollView({
            style_class: 'lumen-results-scroll',
            x_expand: false,
            y_expand: true,
            clip_to_allocation: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });

        this._resultsList = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-results-list',
            x_expand: true,
            clip_to_allocation: true,
        });
        this._resultsList.accessible_role = Atk.Role.LIST;
        this._scrollView.set_child(this._resultsList);
        this._contentSplit.add_child(this._scrollView);

        this._previewPanel = new PreviewPanel();
        this._contentSplit.add_child(this._previewPanel.actor);

        this._dialog.add_child(this._contentSplit);

        this._footer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lumen-footer',
            x_expand: true,
            clip_to_allocation: true,
            visible: false,
        });

        const footerHints = new St.Label({
            text: '↑↓ Navegar  •  Enter Abrir  •  Ctrl+Enter Pasta  •  Tab Categoria  •  Ctrl+C Copiar  •  Esc Fechar',
            style_class: 'lumen-footer-hints',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        footerHints.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        footerHints.clutter_text.single_line_mode = true;
        this._footer.add_child(footerHints);
        this._dialog.add_child(this._footer);

        this._backdrop.add_child(this._dialog);
        this._updateThemeAndBlurEffect();
    }

    _attachToChrome() {
        if (this._isAttachedToChrome || !this._backdrop)
            return;
        Main.layoutManager.addTopChrome(this._backdrop, {
            trackFullscreen: true,
        });
        this._isAttachedToChrome = true;
    }

    _detachFromChrome() {
        if (!this._isAttachedToChrome || !this._backdrop)
            return;
        try {
            Main.layoutManager.removeChrome(this._backdrop);
        } catch {
            // Ignora se já removido
        }
        this._isAttachedToChrome = false;
    }

    _updateThemeAndBlurEffect() {
        if (!this._dialog)
            return;

        const themePreset = this._settings.getThemePreset();
        for (const cls of THEME_CLASS_NAMES)
            this._dialog.remove_style_class_name(cls);

        this._dialog.add_style_class_name(`lumen-theme-${themePreset}`);

        const themeObj = AVAILABLE_THEMES.find(t => t.id === themePreset);
        const isLight = Boolean(themeObj?.isLight);
        const isLiquidGlass = Boolean(themeObj?.isLiquidGlass);

        if (isLight)
            this._dialog.add_style_class_name('lumen-light-theme');
        else
            this._dialog.remove_style_class_name('lumen-light-theme');

        if (this._specularHighlight)
            this._specularHighlight.visible = isLiquidGlass;

        const fontSize = this._settings.getSearchFontSize();
        const radius = isLiquidGlass
            ? Math.max(24, this._settings.getBorderRadius())
            : this._settings.getBorderRadius();
        this._dialog.style = `border-radius: ${radius}px;`;
        if (this._entry)
            this._entry.style = `font-size: ${fontSize}px;`;

        this._dialog.remove_effect_by_name('lumen-blur');

        const blurMode = this._settings.getBlurMode();
        const animationsEnabled = this._desktopInterfaceSettings.get_boolean('enable-animations');
        const shouldUseBlur =
            blurMode === 'always' || (blurMode === 'hybrid' && animationsEnabled);

        if (shouldUseBlur) {
            try {
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                const scaleFactor = themeContext?.scale_factor || 1;
                const blurRadius = isLiquidGlass ? 38 : 34;
                const blurBrightness = isLiquidGlass ? 1.0 : (isLight ? 0.96 : 0.88);
                const blurEffect = new Shell.BlurEffect({
                    name: 'lumen-blur',
                    radius: Math.round(blurRadius * scaleFactor),
                    brightness: blurBrightness,
                    mode: Shell.BlurMode.BACKDROP,
                });
                this._dialog.add_effect(blurEffect);
                this._dialog.remove_style_class_name('lumen-fallback-acrylic');
            } catch {
                this._dialog.add_style_class_name('lumen-fallback-acrylic');
            }
        } else {
            this._dialog.add_style_class_name('lumen-fallback-acrylic');
        }
    }

    /**
     * Garante que a soma da lista de resultados + painel de pré-visualização
     * nunca ultrapasse a largura da janela (`this._dialog.width`), evitando corte lateral.
     */
    _syncLayoutWidths() {
        if (!this._dialog || !this._contentSplit || !this._scrollView || !this._previewPanel)
            return;

        const dialogWidth = this._dialog.width || this._settings.getWindowWidth() || 680;
        const innerDialogWidth = Math.max(480, dialogWidth - 4);
        const showPreview =
            this._settings.getShowPreviewPanel() &&
            Boolean(this._previewPanel.actor?.visible);

        const previewWidth = showPreview
            ? Math.min(265, Math.round(innerDialogWidth * 0.39))
            : 0;
        const scrollWidth = showPreview
            ? innerDialogWidth - previewWidth
            : innerDialogWidth;

        this._contentSplit.set_width(innerDialogWidth);
        this._scrollView.set_width(scrollWidth);
        this._resultsList.set_width(Math.max(220, scrollWidth - 18));
        if (showPreview)
            this._previewPanel.actor.set_width(previewWidth);
    }

    _bindEvents() {
        this._signals = [];

        const connectSig = (obj, sig, handler) => {
            if (!obj)
                return;
            const id = obj.connect(sig, handler);
            this._signals.push({ obj, id });
        };

        connectSig(this._desktopInterfaceSettings, 'changed::color-scheme', () => {
            this._updateThemeAndBlurEffect();
        });

        connectSig(this._desktopInterfaceSettings, 'changed::enable-animations', () => {
            this._updateThemeAndBlurEffect();
        });

        this._settings.connectChanged('blur-mode', () => this._updateThemeAndBlurEffect());
        this._settings.connectChanged('theme-preset', () => this._updateThemeAndBlurEffect());
        this._settings.connectChanged('search-font-size', () => this._updateThemeAndBlurEffect());
        this._settings.connectChanged('border-radius', () => this._updateThemeAndBlurEffect());
        this._settings.connectChanged('window-width', () => {
            if (this._isOpen)
                this._positionDialog();
        });

        connectSig(this._conflictActionBtn, 'clicked', () => {
            this._settings.applySuggestedAlternativeShortcut();
            this._conflictBanner.visible = false;
        });

        connectSig(this._backdrop, 'button-press-event', (_actor, event) => {
            const [stageX, stageY] = event.get_coords();
            const [ok, localX, localY] = this._dialog.transform_stage_point(stageX, stageY);
            const isInsideDialog =
                ok &&
                localX >= 0 &&
                localY >= 0 &&
                localX <= this._dialog.width &&
                localY <= this._dialog.height;

            if (!isInsideDialog) {
                this.hide(true);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const clutterText = this._entry.clutter_text;

        connectSig(clutterText, 'text-changed', () => {
            const query = this._entry.get_text();
            this._searchEngine.search(query, (results, meta) => {
                this._renderResults(results, meta);
            });
        });

        connectSig(clutterText, 'key-press-event', (_actor, event) => {
            return this._handleKeyPress(event);
        });

        connectSig(clutterText, 'activate', () => {
            if (this._isOpen && this._results.length > 0)
                this._activateIndex(this._selectedIndex, { ctrlKey: false });
        });

        connectSig(this._backdrop, 'captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.KEY_PRESS)
                return this._handleKeyPress(event);
            return Clutter.EVENT_PROPAGATE;
        });

        connectSig(Main.overview, 'showing', () => {
            if (this._isOpen)
                this.hide(true);
        });

        connectSig(global.display, 'notify::focus-window', () => {
            if (this._isOpen)
                this.hide(true);
        });
    }

    _handleKeyPress(event) {
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        const ctrlKey = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const altKey = (state & Clutter.ModifierType.MOD1_MASK) !== 0;
        const superKey = (state & Clutter.ModifierType.SUPER_MASK) !== 0;

        if ((altKey || superKey) && (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_ISO_Left_Tab)) {
            this.hide(true);
            return Clutter.EVENT_PROPAGATE;
        }

        if (symbol === Clutter.KEY_Escape) {
            this.hide(false);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Down) {
            this._moveSelection(1);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Up) {
            this._moveSelection(-1);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_ISO_Left_Tab) {
            this._jumpCategory(symbol === Clutter.KEY_ISO_Left_Tab ? -1 : 1);
            return Clutter.EVENT_STOP;
        }

        if (
            symbol === Clutter.KEY_Return ||
            symbol === Clutter.KEY_KP_Enter ||
            symbol === Clutter.KEY_ISO_Enter
        ) {
            this._activateIndex(this._selectedIndex, { ctrlKey });
            return Clutter.EVENT_STOP;
        }

        if (ctrlKey && (symbol === Clutter.KEY_c || symbol === Clutter.KEY_C)) {
            const selection = this._entry.clutter_text.get_selection();
            if (!selection || selection.length === 0) {
                this._copySelectedItemValue();
                return Clutter.EVENT_STOP;
            }
        }

        if (ctrlKey && symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
            const targetIdx = symbol - Clutter.KEY_1;
            if (targetIdx < this._results.length) {
                this._activateIndex(targetIdx, { ctrlKey: false });
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _moveSelection(delta) {
        if (this._rows.length === 0)
            return;

        this._rows[this._selectedIndex]?.setSelected(false);
        this._selectedIndex =
            (this._selectedIndex + delta + this._rows.length) % this._rows.length;

        const activeRow = this._rows[this._selectedIndex];
        activeRow?.setSelected(true);
        this._ensureRowVisible(activeRow);
        this._previewPanel.update(
            this._results[this._selectedIndex],
            this._settings.getShowPreviewPanel()
        );
        this._syncLayoutWidths();
    }

    _jumpCategory(direction) {
        if (this._categoryStartIndices.length <= 1)
            return;

        let currentGroup = 0;
        for (let i = 0; i < this._categoryStartIndices.length; i++) {
            if (this._selectedIndex >= this._categoryStartIndices[i])
                currentGroup = i;
        }

        const nextGroup =
            (currentGroup + direction + this._categoryStartIndices.length) %
            this._categoryStartIndices.length;
        const targetIndex = this._categoryStartIndices[nextGroup];

        this._rows[this._selectedIndex]?.setSelected(false);
        this._selectedIndex = targetIndex;
        const activeRow = this._rows[this._selectedIndex];
        activeRow?.setSelected(true);
        this._ensureRowVisible(activeRow);
        this._previewPanel.update(
            this._results[this._selectedIndex],
            this._settings.getShowPreviewPanel()
        );
        this._syncLayoutWidths();
    }

    _ensureRowVisible(row) {
        if (!row || !row.actor)
            return;

        const vAdjust = this._scrollView.vadjustment;
        if (!vAdjust)
            return;

        const [, rowY] = row.actor.get_transformed_position();
        const [, scrollY] = this._scrollView.get_transformed_position();
        const relativeTop = rowY - scrollY + vAdjust.value;
        const rowHeight = row.actor.height;
        const pageSize = vAdjust.page_size;

        if (relativeTop < vAdjust.value)
            vAdjust.value = Math.max(0, relativeTop - 12);
        else if (relativeTop + rowHeight > vAdjust.value + pageSize)
            vAdjust.value = relativeTop + rowHeight - pageSize + 12;
    }

    _copySelectedItemValue() {
        const current = this._results[this._selectedIndex];
        if (!current)
            return;

        const textToCopy = current.clipboardText || current.filePath || current.title || '';
        if (!textToCopy)
            return;

        this.copyTextToClipboard(textToCopy);
        this._latencyBadge.text = 'Copiado!';
        this._latencyBadge.visible = true;
    }

    copyTextToClipboard(text) {
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, String(text));
    }

    _activateIndex(index, modifiers = {}) {
        const item = this._results[index];
        if (!item)
            return;

        this._usageTracker.recordActivation(item.id);
        this.hide(true);

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            try {
                if (modifiers.ctrlKey && typeof item.onCtrlActivate === 'function')
                    item.onCtrlActivate();
                else if (typeof item.onActivate === 'function')
                    item.onActivate();
            } catch (err) {
                console.error('[Lumen] Erro ao ativar item:', err);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderResults(results, meta = {}) {
        for (const row of this._rows)
            row.destroy();
        this._rows = [];
        this._resultsList.destroy_all_children();
        this._results = results;
        this._categoryStartIndices = [];
        this._selectedIndex = 0;

        if (typeof meta.elapsedMs === 'number' && results.length > 0) {
            this._latencyBadge.text = `${Math.max(1, Math.round(meta.elapsedMs))} ms`;
            this._latencyBadge.visible = true;
        } else {
            this._latencyBadge.visible = false;
        }

        if (results.length === 0) {
            this._contentSplit.visible = false;
            this._footer.visible = false;
            this._previewPanel.clear();
            return;
        }

        this._contentSplit.visible = true;
        this._footer.visible = true;

        const groupedByCat = new Map();
        for (const item of results) {
            const catLabel = item.categoryLabel || item.category || 'Resultados';
            if (!groupedByCat.has(catLabel))
                groupedByCat.set(catLabel, []);
            groupedByCat.get(catLabel).push(item);
        }

        const orderedResults = [];
        for (const [, items] of groupedByCat)
            orderedResults.push(...items);

        this._results = orderedResults;

        let lastCategory = null;
        for (let i = 0; i < orderedResults.length; i++) {
            const item = orderedResults[i];
            const catLabel = item.categoryLabel || item.category || 'Resultados';
            if (catLabel !== lastCategory) {
                lastCategory = catLabel;
                this._categoryStartIndices.push(i);
                this._resultsList.add_child(createCategoryHeader(catLabel));
            }

            const row = new ResultRow(item, i, clickedIndex => {
                this._activateIndex(clickedIndex, { ctrlKey: false });
            });
            if (i === 0)
                row.setSelected(true);

            this._rows.push(row);
            this._resultsList.add_child(row.actor);
        }

        this._previewPanel.update(
            this._results[0],
            this._settings.getShowPreviewPanel()
        );
        this._syncLayoutWidths();
    }

    _getTargetMonitor() {
        const monitors = Main.layoutManager.monitors;
        if (!monitors || monitors.length === 0)
            return Main.layoutManager.primaryMonitor;

        const behavior = this._settings.getMonitorBehavior();
        if (behavior === 'primary')
            return Main.layoutManager.primaryMonitor;

        if (behavior === 'active-window') {
            const focusWin = global.display.get_focus_window();
            if (focusWin) {
                const idx = focusWin.get_monitor();
                if (monitors[idx])
                    return monitors[idx];
            }
        }

        const currentIdx = global.display.get_current_monitor();
        return monitors[currentIdx] || Main.layoutManager.primaryMonitor;
    }

    _positionDialog() {
        const monitor = this._getTargetMonitor();
        if (!monitor)
            return;

        this._backdrop.set_position(0, 0);
        this._backdrop.set_size(global.stage.width, global.stage.height);

        const configuredWidth = this._settings.getWindowWidth();
        const dialogWidth = Math.min(configuredWidth, Math.round(monitor.width * 0.88));
        this._dialog.width = dialogWidth;
        this._syncLayoutWidths();

        const x = monitor.x + Math.round((monitor.width - dialogWidth) / 2);
        const y = monitor.y + Math.round(monitor.height * 0.18);
        this._dialog.set_position(x, y);
    }

    toggle() {
        if (this._isOpen)
            this.hide(false);
        else
            this.show();
    }

    show() {
        if (this._hideTimeoutId !== 0) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        if (this._isOpen)
            return;

        this._isOpen = true;
        this._attachToChrome();

        const dismissed = this._settings.raw.get_boolean('conflict-warning-dismissed');
        const conflictInfo = this._settings.checkInputSourceShortcutConflict();
        this._conflictBanner.visible = !dismissed && conflictInfo.hasConflict;

        this._positionDialog();
        this._entry.set_text('');
        this._renderResults([], { elapsedMs: 0 });

        this._backdrop.reactive = true;
        this._backdrop.visible = true;
        this._dialog.remove_all_transitions();

        if (!this._modalGrab) {
            this._modalGrab = Main.pushModal(this._backdrop, {
                actionMode: Shell.ActionMode.NORMAL,
            });
        }
        this._entry.grab_key_focus();

        const animationsEnabled = this._desktopInterfaceSettings.get_boolean('enable-animations');

        if (animationsEnabled) {
            this._dialog.opacity = 0;
            this._dialog.set_scale(0.97, 0.97);
            this._dialog.ease({
                opacity: 255,
                scale_x: 1.0,
                scale_y: 1.0,
                duration: 115,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._dialog.opacity = 255;
            this._dialog.set_scale(1.0, 1.0);
        }
    }

    /**
     * Oculta a janela do Lumen, libera o grab modal e remove o ator do TopChrome
     * para que nunca reste uma camada invisível interceptando o desktop.
     */
    hide(immediate = false) {
        if (this._hideTimeoutId !== 0) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        if (!this._isOpen && !this._isAttachedToChrome)
            return;

        this._isOpen = false;
        this._searchEngine.cancelCurrentSearch();

        if (this._modalGrab) {
            try {
                Main.popModal(this._modalGrab);
            } catch {
                // Grab já liberado
            }
            this._modalGrab = null;
        }

        if (!this._backdrop || !this._dialog)
            return;

        this._backdrop.reactive = false;
        this._dialog.remove_all_transitions();

        const finalizeDetach = () => {
            if (this._isOpen || !this._backdrop)
                return;
            this._backdrop.visible = false;
            this._detachFromChrome();
        };

        const animationsEnabled = this._desktopInterfaceSettings.get_boolean('enable-animations');
        if (!immediate && animationsEnabled) {
            this._dialog.ease({
                opacity: 0,
                scale_x: 0.95,
                scale_y: 0.95,
                duration: 115,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => finalizeDetach(),
            });
            // Fallback de segurança caso onComplete seja interrompido pelo compositor
            this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
                this._hideTimeoutId = 0;
                finalizeDetach();
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this._dialog.opacity = 0;
            finalizeDetach();
        }
    }

    destroy() {
        this.hide(true);

        if (this._hideTimeoutId !== 0) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        for (const { obj, id } of this._signals) {
            try {
                obj.disconnect(id);
            } catch {
                // Ignora objeto já destruído
            }
        }
        this._signals = [];

        for (const row of this._rows)
            row.destroy();
        this._rows = [];

        this._previewPanel?.destroy();
        this._previewPanel = null;

        if (this._backdrop) {
            this._detachFromChrome();
            this._backdrop.destroy();
            this._backdrop = null;
        }
        this._dialog = null;
        this._desktopInterfaceSettings = null;
    }
}
