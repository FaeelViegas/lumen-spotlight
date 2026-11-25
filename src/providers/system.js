import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

/**
 * Provedor de Comandos do Sistema para GNOME Shell 50.1.
 * Utiliza `SystemActions.getDefault()` para ações de sessão/energia e `Gio.Settings` / `Gio.Subprocess`
 * para alternar Modo Escuro, Não Perturbe (DND), Wi-Fi e Bluetooth.
 */
export class SystemProvider extends BaseProvider {
    constructor() {
        super('system', 'Comandos do Sistema', null);
        this._sysActions = SystemActions.getDefault();
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._notifSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });
    }

    _getCommands() {
        const isDark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
        const showBanners = this._notifSettings.get_boolean('show-banners');
        const isDnd = !showBanners;

        return [
            {
                id: 'sys:lock',
                title: 'Bloquear Tela',
                subtitle: 'Bloqueia a sessão atual imediatamente',
                keywords: ['lock', 'screen', 'bloquear', 'tela', 'seguranca'],
                iconName: 'system-lock-screen-symbolic',
                action: () => this._sysActions.activateLockScreen(),
            },
            {
                id: 'sys:suspend',
                title: 'Suspender Computador',
                subtitle: 'Coloca o sistema em modo de suspensão (sleep)',
                keywords: ['suspend', 'sleep', 'suspender', 'dormir'],
                iconName: 'media-playback-pause-symbolic',
                action: () => this._sysActions.activateSuspend(),
            },
            {
                id: 'sys:restart',
                title: 'Reiniciar Sistema',
                subtitle: 'Abre o diálogo de confirmação para reiniciar o computador',
                keywords: ['reboot', 'restart', 'reiniciar', 'sistema'],
                iconName: 'system-reboot-symbolic',
                action: () => this._sysActions.activateRestart(),
            },
            {
                id: 'sys:poweroff',
                title: 'Desligar Computador',
                subtitle: 'Abre o diálogo de confirmação para desligar o sistema',
                keywords: ['poweroff', 'shutdown', 'desligar', 'energia'],
                iconName: 'system-shutdown-symbolic',
                action: () => this._sysActions.activatePowerOff(),
            },
            {
                id: 'sys:logout',
                title: 'Encerrar Sessão (Logout)',
                subtitle: 'Finaliza a sessão atual do GNOME Wayland',
                keywords: ['logout', 'sair', 'sessao', 'logoff'],
                iconName: 'system-log-out-symbolic',
                action: () => this._sysActions.activateLogout(),
            },
            {
                id: 'sys:dark-mode',
                title: isDark ? 'Alternar para Tema Claro' : 'Alternar para Modo Escuro',
                subtitle: `Estilo atual: ${isDark ? 'Escuro (prefer-dark)' : 'Claro (default)'}`,
                keywords: ['dark', 'mode', 'light', 'theme', 'modo', 'escuro', 'claro', 'tema'],
                iconName: 'weather-clear-night-symbolic',
                action: () => {
                    this._interfaceSettings.set_string(
                        'color-scheme',
                        isDark ? 'default' : 'prefer-dark'
                    );
                },
            },
            {
                id: 'sys:dnd',
                title: isDnd ? 'Desativar Não Perturbe' : 'Ativar Não Perturbe',
                subtitle: `Notificações visuais: ${showBanners ? 'Ativadas' : 'Silenciadas (Não Perturbe)'}`,
                keywords: ['dnd', 'do not disturb', 'nao perturbe', 'notificacoes', 'silenciar'],
                iconName: isDnd ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic',
                action: () => {
                    this._notifSettings.set_boolean('show-banners', !showBanners);
                },
            },
            {
                id: 'sys:wifi-toggle',
                title: 'Alternar Wi-Fi (Ligar / Desligar)',
                subtitle: 'Comuta o rádio Wi-Fi via NetworkManager',
                keywords: ['wifi', 'wi-fi', 'rede', 'wireless', 'internet', 'network'],
                iconName: 'network-wireless-signal-excellent-symbolic',
                action: () => this._toggleWifi(),
            },
            {
                id: 'sys:bluetooth-toggle',
                title: 'Alternar Bluetooth (Ligar / Desligar)',
                subtitle: 'Comuta o adaptador Bluetooth via rfkill/bluetoothctl',
                keywords: ['bluetooth', 'bt', 'parear', 'sem fio'],
                iconName: 'bluetooth-active-symbolic',
                action: () => this._toggleBluetooth(),
            },
            {
                id: 'sys:screenshot',
                title: 'Capturar Tela (Screenshot UI)',
                subtitle: 'Abre a interface interativa de captura de tela e vídeo do GNOME',
                keywords: ['screenshot', 'captura', 'print', 'tela', 'gravar'],
                iconName: 'applets-screenshooter-symbolic',
                action: () => this._sysActions.activateScreenshotUI(),
            },
        ];
    }

    _toggleWifi() {
        try {
            const proc = Gio.Subprocess.new(
                ['nmcli', 'radio', 'wifi'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(res);
                    const isEnabled = (stdout || '').trim().toLowerCase() === 'enabled';
                    Gio.Subprocess.new(
                        ['nmcli', 'radio', 'wifi', isEnabled ? 'off' : 'on'],
                        Gio.SubprocessFlags.NONE
                    );
                } catch {
                    // Ignora caso nmcli não esteja instalado
                }
            });
        } catch {
            // Ignora falha
        }
    }

    _toggleBluetooth() {
        try {
            const proc = Gio.Subprocess.new(
                ['bluetoothctl', 'show'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(res);
                    const isPowered = /Powered:\s*yes/i.test(stdout || '');
                    Gio.Subprocess.new(
                        ['bluetoothctl', 'power', isPowered ? 'off' : 'on'],
                        Gio.SubprocessFlags.NONE
                    );
                } catch {
                    // Ignora caso bluetoothctl não esteja disponível
                }
            });
        } catch {
            // Ignora falha
        }
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const commands = this._getCommands();
        const results = [];

        for (const cmd of commands) {
            const titleMatch = computeFuzzyMatch(query, cmd.title);
            const kwMatch = computeFuzzyMatch(query, cmd.keywords.join(' '));
            if (titleMatch.score <= 0 && kwMatch.score <= 0)
                continue;

            results.push({
                id: cmd.id,
                providerId: this.id,
                category: 'system',
                categoryLabel: 'Sistema',
                title: cmd.title,
                subtitle: cmd.subtitle,
                keywords: cmd.keywords,
                iconName: cmd.iconName,
                clipboardText: cmd.title,
                preview: {
                    type: 'system',
                    title: cmd.title,
                    subtitle: 'Comando Nativo do GNOME Shell',
                    description: cmd.subtitle,
                    iconName: cmd.iconName,
                    metadata: [
                        { label: 'Categoria', value: 'Controle do Sistema' },
                        { label: 'Sessão', value: 'Wayland (GNOME 50)' },
                    ],
                },
                onActivate: cmd.action,
            });
        }

        return results;
    }

    destroy() {
        this._interfaceSettings = null;
        this._notifSettings = null;
        this._sysActions = null;
    }
}
