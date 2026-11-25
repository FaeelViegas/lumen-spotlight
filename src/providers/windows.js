import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

const GNOME_CONTROL_CENTER_PANELS = [
    { id: 'wifi', title: 'Configurações de Wi-Fi', keywords: ['wifi', 'rede', 'wireless', 'internet'], icon: 'network-wireless-symbolic' },
    { id: 'network', title: 'Configurações de Rede Cabeada / VPN', keywords: ['network', 'vpn', 'ethernet', 'ip'], icon: 'network-wired-symbolic' },
    { id: 'bluetooth', title: 'Configurações de Bluetooth', keywords: ['bluetooth', 'parear', 'dispositivos'], icon: 'bluetooth-active-symbolic' },
    { id: 'display', title: 'Monitores e Resolução (Displays)', keywords: ['monitor', 'tela', 'resolucao', 'escala', 'wayland', 'display'], icon: 'preferences-desktop-display-symbolic' },
    { id: 'sound', title: 'Configurações de Som e Áudio', keywords: ['som', 'audio', 'volume', 'microfone', 'fone'], icon: 'audio-volume-high-symbolic' },
    { id: 'power', title: 'Energia e Bateria', keywords: ['energia', 'bateria', 'power', 'economia'], icon: 'battery-full-symbolic' },
    { id: 'multitasking', title: 'Multitarefa e Espaços de Trabalho', keywords: ['multitarefa', 'workspaces', 'cantos'], icon: 'preferences-system-symbolic' },
    { id: 'appearance', title: 'Aparência, Papel de Parede e Cores de Destaque', keywords: ['aparencia', 'tema', 'accent', 'cor', 'wallpaper', 'escuro'], icon: 'preferences-desktop-appearance-symbolic' },
    { id: 'notifications', title: 'Configurações de Notificações', keywords: ['notificacoes', 'alertas', 'banners'], icon: 'preferences-system-notifications-symbolic' },
    { id: 'keyboard', title: 'Teclado e Atalhos do Sistema', keywords: ['teclado', 'atalhos', 'shortcuts', 'layout', 'input'], icon: 'input-keyboard-symbolic' },
    { id: 'mouse', title: 'Mouse e Touchpad', keywords: ['mouse', 'touchpad', 'cursor', 'velocidade'], icon: 'input-mouse-symbolic' },
    { id: 'system', title: 'Sobre o Sistema (Ubuntu 26.04 / GNOME 50)', keywords: ['sistema', 'sobre', 'about', 'versao', 'usuarios', 'data'], icon: 'help-about-symbolic' },
];

/**
 * Provedor de Janelas Abertas (em todos os workspaces) e Painéis do GNOME Settings.
 */
export class WindowsProvider extends BaseProvider {
    constructor() {
        super('windows', 'Janelas e Configurações', null);
        this._windowTracker = Shell.WindowTracker.get_default();
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const results = [];
        const actors = global.get_window_actors();

        for (const actor of actors) {
            const metaWindow = actor.get_meta_window();
            if (!metaWindow || metaWindow.is_skip_taskbar())
                continue;

            const winTitle = metaWindow.get_title() || '';
            const app = this._windowTracker.get_window_app(metaWindow);
            const appName = app ? app.get_name() : (metaWindow.get_wm_class() || 'Janela');
            const wsIndex = (metaWindow.get_workspace()?.index() ?? 0) + 1;

            const titleMatch = computeFuzzyMatch(query, winTitle);
            const appMatch = computeFuzzyMatch(query, appName);
            if (titleMatch.score <= 0 && appMatch.score <= 0)
                continue;

            results.push({
                id: `win:${metaWindow.get_stable_sequence()}`,
                providerId: this.id,
                category: 'windows',
                categoryLabel: 'Janelas Abertas',
                title: winTitle || appName,
                subtitle: `${appName} • Espaço de Trabalho ${wsIndex}`,
                keywords: [appName, `workspace ${wsIndex}`, 'janela'],
                iconName: 'focus-windows-symbolic',
                clipboardText: winTitle,
                preview: {
                    type: 'window',
                    title: winTitle || appName,
                    subtitle: appName,
                    metadata: [
                        { label: 'Aplicativo', value: appName },
                        { label: 'Espaço de Trabalho', value: `Workspace ${wsIndex}` },
                        { label: 'Classe WM', value: metaWindow.get_wm_class() || 'Wayland Surface' },
                    ],
                },
                onActivate: () => {
                    Main.activateWindow(metaWindow);
                },
            });
        }

        // Painéis diretos do GNOME Control Center (gnome-control-center <panel>)
        for (const panel of GNOME_CONTROL_CENTER_PANELS) {
            const tMatch = computeFuzzyMatch(query, panel.title);
            const kMatch = computeFuzzyMatch(query, panel.keywords.join(' '));
            if (tMatch.score <= 0 && kMatch.score <= 0)
                continue;

            results.push({
                id: `gcc:${panel.id}`,
                providerId: this.id,
                category: 'windows',
                categoryLabel: 'Configurações do GNOME',
                title: panel.title,
                subtitle: `Painel de Configurações • gnome-control-center ${panel.id}`,
                keywords: panel.keywords,
                iconName: panel.icon,
                clipboardText: `gnome-control-center ${panel.id}`,
                preview: {
                    type: 'settings',
                    title: panel.title,
                    subtitle: 'Configurações do GNOME',
                    iconName: panel.icon,
                    metadata: [
                        { label: 'Painel', value: panel.id },
                        { label: 'Aplicativo', value: 'GNOME Control Center' },
                    ],
                },
                onActivate: () => {
                    try {
                        Gio.Subprocess.new(
                            ['gnome-control-center', panel.id],
                            Gio.SubprocessFlags.NONE
                        );
                    } catch {
                        // Ignora se gnome-control-center não estiver presente
                    }
                },
            });
        }

        return results;
    }
}
