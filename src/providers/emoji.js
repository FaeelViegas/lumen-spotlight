import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

const EMOJI_CATALOG = [
    { char: '😀', name: 'Sorriso Aberto', keywords: ['sorriso', 'feliz', 'smile', 'happy', 'rosto'] },
    { char: '😂', name: 'Rindo até Chorar', keywords: ['rindo', 'lagrimas', 'joy', 'lol', ' engracado'] },
    { char: '🥳', name: 'Festa / Comemoração', keywords: ['festa', 'parabens', 'party', 'celebrar'] },
    { char: '😎', name: 'Óculos de Sol', keywords: ['cool', 'oculos', 'estilo', 'legal'] },
    { char: '🤔', name: 'Pensativo', keywords: ['pensando', 'thinking', 'duvida', 'hmm'] },
    { char: '🚀', name: 'Foguete / Deploy', keywords: ['foguete', 'rocket', 'deploy', 'rapido', 'lancamento'] },
    { char: '🔥', name: 'Fogo / Em Alta', keywords: ['fogo', 'fire', 'quente', 'top'] },
    { char: '✨', name: 'Brilhos / Novo Recurso', keywords: ['brilho', 'sparkles', 'magia', 'novo'] },
    { char: '✅', name: 'Marca de Verificação', keywords: ['check', 'ok', 'sucesso', 'feito', 'correto'] },
    { char: '❌', name: 'Cruz de Erro', keywords: ['erro', 'cancelar', 'x', 'falha', 'nao'] },
    { char: '⚠️', name: 'Alerta / Atenção', keywords: ['alerta', 'warning', 'aviso', 'cuidado'] },
    { char: '🐛', name: 'Bug / Inseto', keywords: ['bug', 'inseto', 'erro', 'debug'] },
    { char: '❤️', name: 'Coração Vermelho', keywords: ['coracao', 'amor', 'heart', 'love'] },
    { char: '👍', name: 'Joinha / Aprovado', keywords: ['joinha', 'ok', 'thumbsup', 'positivo', 'sim'] },
    { char: '🙏', name: 'Mãos Juntas / Obrigado', keywords: ['obrigado', 'please', 'thanks', 'gratidao'] },
    { char: '💻', name: 'Notebook / Código', keywords: ['computador', 'laptop', 'dev', 'codigo', 'pc'] },
    { char: '🐧', name: 'Pinguim / Linux', keywords: ['linux', 'tux', 'pinguim', 'ubuntu', 'gnome'] },
    { char: '⚡', name: 'Raio / Alta Performance', keywords: ['raio', 'energia', 'zap', 'rapido', 'performance'] },
    { char: '🔒', name: 'Cadeado Fechado', keywords: ['seguranca', 'lock', 'privacidade', 'senha'] },
    { char: '📎', name: 'Clipe de Papel', keywords: ['anexo', 'clipe', 'paperclip'] },
    { char: '→', name: 'Seta para a Direita', keywords: ['seta', 'arrow', 'direita', 'simbolo'] },
    { char: '←', name: 'Seta para a Esquerda', keywords: ['seta', 'arrow', 'esquerda', 'simbolo'] },
    { char: '∞', name: 'Símbolo de Infinito', keywords: ['infinito', 'infinity', 'matematica', 'simbolo'] },
    { char: '≈', name: 'Aproximadamente Igual', keywords: ['aproximado', 'igual', 'matematica', 'simbolo'] },
];

/**
 * Provedor de Emoji e Símbolos acionado pelo prefixo `:` (ex.: `:sorriso`, `:foguete`).
 */
export class EmojiProvider extends BaseProvider {
    constructor(copyToClipboardCallback) {
        super('emoji', 'Emojis e Símbolos', ':');
        this._copyCallback = copyToClipboardCallback;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const trimmed = query.trim();
        if (!trimmed.startsWith(':'))
            return [];

        const subQuery = trimmed.slice(1).trim();
        const results = [];

        for (let i = 0; i < EMOJI_CATALOG.length; i++) {
            const item = EMOJI_CATALOG[i];
            if (!subQuery) {
                results.push(this._toResultItem(item, 900 - i));
                continue;
            }

            const nameMatch = computeFuzzyMatch(subQuery, item.name);
            const kwMatch = computeFuzzyMatch(subQuery, item.keywords.join(' '));
            const best = Math.max(nameMatch.score, kwMatch.score);
            if (best > 0)
                results.push(this._toResultItem(item, 700 + best));
        }

        return results;
    }

    _toResultItem(item, explicitScore) {
        return {
            id: `emoji:${item.char}`,
            providerId: this.id,
            category: 'emoji',
            categoryLabel: 'Emojis e Símbolos',
            title: `${item.char}  ${item.name}`,
            subtitle: `Atalho :${item.keywords[0]} • Enter copia o caractere`,
            iconName: 'face-smile-symbolic',
            clipboardText: item.char,
            explicitScore,
            preview: {
                type: 'emoji',
                title: `${item.char}  ${item.name}`,
                subtitle: `Unicode U+${item.char.codePointAt(0).toString(16).toUpperCase()}`,
                metadata: [
                    { label: 'Caractere', value: item.char },
                    { label: 'Palavras-chave', value: item.keywords.join(', ') },
                ],
            },
            onActivate: () => {
                this._copyCallback?.(item.char);
            },
        };
    }
}
