import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

/**
 * Cria um cabeçalho de categoria pequeno e discreto no estilo Spotlight.
 * @param {string} categoryTitle
 * @returns {St.Label}
 */
export function createCategoryHeader(categoryTitle) {
    const label = new St.Label({
        text: categoryTitle.toUpperCase(),
        style_class: 'lumen-category-header',
        x_expand: true,
        x_align: Clutter.ActorAlign.START,
    });
    label.accessible_role = Atk.Role.HEADING;
    return label;
}

/**
 * Linha de resultado individual (ResultRow) com suporte a:
 * - Ícone (`gicon` ou `icon_name`)
 * - Título e subtítulo com elipse
 * - Badge de atalho rápido `Ctrl+1..9`
 * - Acessibilidade (`Atk.Role.LIST_ITEM`)
 * - Orientação estritamente via `Clutter.Orientation` (padrão GNOME Shell 50)
 */
export class ResultRow {
    constructor(item, index, onClickCallback) {
        this.item = item;
        this.index = index;
        this._selected = false;

        this.actor = new St.Button({
            style_class: 'lumen-result-row',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            clip_to_allocation: true,
        });
        this.actor.accessible_role = Atk.Role.LIST_ITEM;
        this.actor.accessible_name = `${item.title} — ${item.subtitle || ''}`;

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lumen-result-row-box',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
        });

        const iconProps = {
            style_class: 'lumen-result-icon',
            icon_size: 28,
            y_align: Clutter.ActorAlign.CENTER,
        };
        if (item.gicon)
            iconProps.gicon = item.gicon;
        else
            iconProps.icon_name = item.iconName || 'application-x-executable-symbolic';

        this._icon = new St.Icon(iconProps);
        box.add_child(this._icon);

        const textContainer = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lumen-result-text-box',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
        });

        this._titleLabel = new St.Label({
            text: item.title || '',
            style_class: 'lumen-result-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._titleLabel.clutter_text.single_line_mode = true;
        textContainer.add_child(this._titleLabel);

        if (item.subtitle) {
            this._subtitleLabel = new St.Label({
                text: item.subtitle,
                style_class: 'lumen-result-subtitle',
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
            });
            this._subtitleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
            this._subtitleLabel.clutter_text.single_line_mode = true;
            textContainer.add_child(this._subtitleLabel);
        }

        box.add_child(textContainer);

        // Atalho numérico rápido Ctrl+1..9 para os 9 primeiros itens
        if (index < 9) {
            this._shortcutBadge = new St.Label({
                text: `Ctrl+${index + 1}`,
                style_class: 'lumen-shortcut-badge',
                y_align: Clutter.ActorAlign.CENTER,
            });
            box.add_child(this._shortcutBadge);
        }

        this.actor.set_child(box);

        this._clickSignalId = this.actor.connect('clicked', () => {
            onClickCallback?.(this.index);
        });
    }

    setSelected(selected) {
        if (this._selected === selected)
            return;
        this._selected = selected;
        if (selected)
            this.actor.add_style_pseudo_class('selected');
        else
            this.actor.remove_style_pseudo_class('selected');
    }

    destroy() {
        if (this._clickSignalId && this.actor) {
            this.actor.disconnect(this._clickSignalId);
            this._clickSignalId = 0;
        }
        this.actor?.destroy();
        this.actor = null;
    }
}
