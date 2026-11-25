import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

/**
 * Encurta um valor longo (ex.: caminho de arquivo `/var/lib/flatpak/exports/.../rest.insomnia.Insomnia.desktop`)
 * exibindo apenas um trecho curto legível (ex.: `…/rest.in….desktop`),
 * enquanto o caminho completo é exibido no tooltip ao passar o mouse (hover).
 *
 * @param {string} rawValue
 * @param {number} [maxChars=19]
 * @returns {{ shortText: string, isTruncated: boolean }}
 */
export function formatShortMetaValue(rawValue, maxChars = 19) {
    const str = String(rawValue ?? '').trim();
    if (str.length <= maxChars)
        return { shortText: str, isTruncated: false };

    if (str.includes('/')) {
        const parts = str.split('/').filter(Boolean);
        const last = parts[parts.length - 1] || str;

        if (last.length > maxChars - 2) {
            const avail = Math.max(8, maxChars - 3);
            const headLen = Math.ceil(avail / 2);
            const tailLen = Math.floor(avail / 2);
            return {
                shortText: `…/${last.slice(0, headLen)}…${last.slice(-tailLen)}`,
                isTruncated: true,
            };
        }

        return { shortText: `…/${last}`, isTruncated: true };
    }

    const avail = Math.max(8, maxChars - 1);
    const headLen = Math.ceil(avail / 2);
    const tailLen = Math.floor(avail / 2);
    return {
        shortText: `${str.slice(0, headLen)}…${str.slice(-tailLen)}`,
        isTruncated: true,
    };
}

/**
 * Painel lateral de pré-visualização (Quick Look / Spotlight Preview).
 * Exibe miniaturas de imagens, trechos de código/texto, metadados formatados em duas linhas
 * ou trecho curto + Tooltip flutuante com o caminho completo ao passar o mouse (hover).
 */
export class PreviewPanel {
    constructor() {
        this._cancellable = null;
        this._rowSignals = [];

        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-preview-panel',
            x_expand: false,
            y_expand: true,
            clip_to_allocation: true,
            visible: false,
        });

        this._headerBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-preview-header',
            x_expand: true,
            clip_to_allocation: true,
        });

        this._previewIcon = new St.Icon({
            style_class: 'lumen-preview-icon',
            icon_size: 56,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(this._previewIcon);

        this._titleLabel = new St.Label({
            style_class: 'lumen-preview-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._headerBox.add_child(this._titleLabel);

        this._subtitleLabel = new St.Label({
            style_class: 'lumen-preview-subtitle',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._subtitleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        this._headerBox.add_child(this._subtitleLabel);

        this.actor.add_child(this._headerBox);

        this._bodyScroll = new St.ScrollView({
            style_class: 'lumen-preview-scroll',
            x_expand: true,
            y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });

        this._bodyContent = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-preview-body',
            x_expand: true,
            clip_to_allocation: true,
        });
        this._bodyScroll.set_child(this._bodyContent);
        this.actor.add_child(this._bodyScroll);

        // Banner flutuante de Tooltip para exibir o caminho completo no hover sem cortar nada
        this._tooltipBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-preview-tooltip',
            x_expand: true,
            visible: false,
        });
        this._tooltipLabel = new St.Label({
            style_class: 'lumen-preview-tooltip-text',
            x_expand: true,
        });
        this._tooltipLabel.clutter_text.line_wrap = true;
        this._tooltipLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._tooltipBox.add_child(this._tooltipLabel);
        this.actor.add_child(this._tooltipBox);

        this._metaContainer = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-preview-meta-list',
            x_expand: true,
            clip_to_allocation: true,
        });
        this.actor.add_child(this._metaContainer);
    }

    _disconnectRowSignals() {
        for (const { obj, id } of this._rowSignals) {
            try {
                obj.disconnect(id);
            } catch {
                // Objeto já destruído
            }
        }
        this._rowSignals = [];
    }

    clear() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        this._disconnectRowSignals();
        this._tooltipBox.visible = false;
        this._bodyContent.destroy_all_children();
        this._metaContainer.destroy_all_children();
        this.actor.visible = false;
    }

    update(item, enabled = true) {
        this.clear();
        if (!enabled || !item || !item.preview)
            return;

        const prev = item.preview;
        this.actor.visible = true;

        if (prev.gicon) {
            this._previewIcon.gicon = prev.gicon;
        } else if (prev.type === 'file' && prev.mimeType?.startsWith('image/') && prev.filePath) {
            this._previewIcon.gicon = new Gio.FileIcon({
                file: Gio.File.new_for_path(prev.filePath),
            });
        } else {
            this._previewIcon.icon_name = prev.iconName || item.iconName || 'text-x-generic-symbolic';
        }

        this._titleLabel.text = prev.title || item.title || '';
        this._subtitleLabel.text = prev.subtitle || '';

        if (prev.textContent || prev.description || prev.snippet) {
            const snippetBox = new St.Label({
                text: prev.textContent || prev.description || prev.snippet,
                style_class: 'lumen-preview-code-block',
                x_expand: true,
            });
            snippetBox.clutter_text.line_wrap = true;
            snippetBox.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            this._bodyContent.add_child(snippetBox);
        }

        if (prev.type === 'file' && prev.filePath && !prev.isDir)
            this._loadAsyncFilePreview(prev);

        this._renderMetadata(prev.metadata || []);
    }

    _renderMetadata(metadataRows) {
        this._disconnectRowSignals();
        this._metaContainer.destroy_all_children();

        for (const row of metadataRows) {
            if (!row || !row.label)
                continue;

            const fullText = String(row.value ?? '');
            const { shortText, isTruncated } = formatShortMetaValue(fullText, 19);

            const line = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                style_class: 'lumen-preview-meta-row',
                reactive: isTruncated,
                track_hover: isTruncated,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                clip_to_allocation: true,
            });

            const keyLabel = new St.Label({
                text: row.label,
                style_class: 'lumen-preview-meta-key',
                x_expand: false,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const valLabel = new St.Label({
                text: shortText,
                style_class: isTruncated
                    ? 'lumen-preview-meta-val lumen-preview-meta-val-hoverable'
                    : 'lumen-preview-meta-val',
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                y_align: Clutter.ActorAlign.CENTER,
            });
            valLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
            valLabel.clutter_text.single_line_mode = true;

            line.add_child(keyLabel);
            line.add_child(valLabel);

            if (isTruncated) {
                const hoverId = line.connect('notify::hover', () => {
                    if (line.hover) {
                        this._tooltipLabel.text = `${row.label}: ${fullText}`;
                        this._tooltipBox.visible = true;
                    } else {
                        this._tooltipBox.visible = false;
                    }
                });
                this._rowSignals.push({ obj: line, id: hoverId });
            }

            this._metaContainer.add_child(line);
        }
    }

    _loadAsyncFilePreview(prev) {
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        const mime = prev.mimeType || '';
        const file = Gio.File.new_for_path(prev.filePath);

        if (mime === 'application/pdf') {
            this._loadPdfMetadata(prev.filePath, prev.metadata || [], cancellable);
            return;
        }

        if (
            mime.startsWith('text/') ||
            mime === 'application/json' ||
            /\.(md|py|js|ts|rs|sh|toml|yaml|yml|css|html|sql)$/i.test(prev.filePath)
        ) {
            file.load_bytes_async(cancellable, (source, res) => {
                try {
                    const [bytes] = source.load_bytes_finish(res);
                    if (cancellable.is_cancelled() || !bytes)
                        return;

                    const data = bytes.get_data();
                    const slice = data.subarray(0, Math.min(data.length, 1600));
                    const decoder = new TextDecoder('utf-8', { fatal: false });
                    const text = decoder.decode(slice).trim();
                    if (!text)
                        return;

                    this._bodyContent.destroy_all_children();
                    const codeLabel = new St.Label({
                        text,
                        style_class: 'lumen-preview-code-block',
                        x_expand: true,
                    });
                    codeLabel.clutter_text.line_wrap = true;
                    codeLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                    this._bodyContent.add_child(codeLabel);
                } catch {
                    // Ignora arquivos binários ou sem permissão de leitura
                }
            });
        }
    }

    _loadPdfMetadata(filePath, baseMeta, cancellable) {
        try {
            const proc = Gio.Subprocess.new(
                ['pdfinfo', filePath],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, cancellable, (source, res) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(res);
                    if (cancellable.is_cancelled() || !stdout)
                        return;

                    const extra = [];
                    for (const line of stdout.split('\n')) {
                        if (line.startsWith('Pages:'))
                            extra.push({ label: 'Páginas', value: line.replace('Pages:', '').trim() });
                        else if (line.startsWith('Author:'))
                            extra.push({ label: 'Autor', value: line.replace('Author:', '').trim() });
                    }
                    if (extra.length > 0)
                        this._renderMetadata([...baseMeta, ...extra]);
                } catch {
                    // pdfinfo opcional
                }
            });
        } catch {
            // pdfinfo não instalado
        }
    }

    destroy() {
        this.clear();
        this.actor?.destroy();
        this.actor = null;
    }
}
