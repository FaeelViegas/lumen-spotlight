# Lumen Spotlight

> **[Read in English](README.md)**

Launcher e motor de busca global instantânea inspirado no **Spotlight do macOS**, construído nativamente para **GNOME Shell 50 (Wayland)** em **GJS (ES Modules)**, **GTK4 / libadwaita** e um daemon persistente de indexação em **SQLite FTS5**.

[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-50-4A86CF?logo=gnome&logoColor=white)](https://www.gnome.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![CI](https://github.com/FaeelViegas/lumen-spotlight/actions/workflows/ci.yml/badge.svg)](https://github.com/FaeelViegas/lumen-spotlight/actions/workflows/ci.yml)

---

## ✨ Funcionalidades

- **Aplicativos (`.desktop`, Flatpak e Snap)**: Busca fuzzy instantânea (`< 5 ms`) com badge de origem e ranking ponderado por frequência e recência.
- **Busca Híbrida de Arquivos e Conteúdo**: Combina **LocalSearch (Tracker 3)** com daemon persistente **SQLite FTS5** (`src/core/indexerDaemon.py`) atualizado em tempo real via `Gio.FileMonitor`.
  - **Filtros inline**: `kind:pdf`, `kind:imagem`, `kind:codigo`, `kind:pasta`, `in:Documentos`, `modified:hoje`, `modified:semana`.
  - **Filtro de Código**: Oculta arquivos de programação e build (`.py`, `.js`, `.ts`, `.cs`, `.rs`, etc.) na busca padrão de documentos (configurável nas Preferências e sobreposto a qualquer momento com `kind:code`).
- **Painel Lateral de Pré-visualização**: Exibe metadados, trechos de texto/código, imagens e caminhos resumidos com tooltip completo ao passar o mouse.
- **Calculadora Científica Segura**: Parser recursivo descendente próprio (zero `eval()`), suportando `2^10 + sqrt(144)`, `15% de 800`, `20% of 450`, `cos(0) + ln(e)`.
- **Conversor de Unidades e Moedas**: Comprimento, massa, volume, temperatura, dados, velocidade, área, tempo (`10 km em milhas`, `100 c em f`, `2 gb em mb`) e moedas (`100 usd em brl`) com cache offline e atualização online opt-in.
- **Dicionário e Tradução Rápida**: Léxico offline PT-BR ↔ EN embutido (`def algoritmo`, `tr ephemeral`).
- **Histórico da Área de Transferência (Opt-in)**: Mantido exclusivamente em RAM durante a sessão, ignorando automaticamente gerenciadores de senhas (`KeePassXC`, `Bitwarden`, `1Password`, `GNOME Secrets`, `Seahorse`).
- **Comandos do Sistema e Janelas Abertas**: Bloquear tela, suspender, reiniciar, desligar, encerrar sessão, alternar Modo Escuro / Não Perturbe / Wi-Fi / Bluetooth, captura de tela e troca rápida entre janelas abertas.
- **Busca na Web por Prefixo**: `g <termo>` (Google), `ddg <termo>` (DuckDuckGo), `yt <termo>` (YouTube), `gh <termo>` (GitHub), `wiki <termo>` (Wikipédia).
- **Emojis e Snippets**: Emojis com `:` (`:sorriso`, `:foguete`) e snippets dinâmicos com `;` (`;email`, `;data`, `;uuid`).
- **6 Temas Embutidos e Customização em Tempo Real**:
  - `Spotlight Dark` (Padrão), `Liquid Glass`, `Cristal (Light)`, `Obsidian (OLED)`, `Nord Frost`, `Catppuccin Mocha`.
  - Ajuste tamanho da fonte (`13–26 px`), largura da janela (`520–960 px`), arredondamento dos cantos (`8–28 px`) e modo de desfoque (`Híbrido`, `Sempre Ativo`, `Apenas CSS`).
- **Preferências Visuais em GTK4 / libadwaita**: Gravador interativo de atalhos, presets de 1 clique, seletor nativo de pastas (`Gtk.FileDialog`), botão de reindexação e editor visual de snippets e motores web.
- **Sistema de Plugins**: Carregue provedores em ES Modules a partir de `~/.local/share/lumen/plugins/`.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Ctrl+Alt+S` *(padrão, configurável)* | Abre/fecha o Lumen Spotlight |
| `↑` / `↓` | Navega pelos resultados |
| `Tab` / `Shift+Tab` | Alterna entre categorias de resultados |
| `Enter` | Abre o app/arquivo ou copia o cálculo/snippet |
| `Ctrl+Enter` | Revela o arquivo ou `.desktop` na pasta |
| `Ctrl+1` .. `Ctrl+9` | Ativa imediatamente o resultado `1..9` |
| `Ctrl+C` | Copia o caminho, valor ou texto do item selecionado |
| `Esc` | Fecha o Lumen Spotlight |

> **Nota para usuários do Ubuntu:** Caso você configure `Super+Espaço`, o Lumen detecta automaticamente conflito com o atalho `switch-input-source` do GNOME e oferece troca com 1 clique para `Alt+Espaço`.

---

## 🚀 Instalação

### Opção 1: Compilar e Instalar a partir do Código-Fonte (Recomendado)

#### Pré-requisitos
- **GNOME Shell 50** (Ubuntu 26.04+ ou distribuição equivalente com GNOME 50)
- `gjs`, `python3`, `libglib2.0-bin` (`glib-compile-schemas`), `gettext` (`msgfmt`), `zip`, `make`

```bash
git clone https://github.com/FaeelViegas/lumen-spotlight.git
cd lumen-spotlight
make install
```

> **Importante no Wayland:** Após instalar uma extensão do GNOME Shell pela primeira vez, **encerre a sessão (Log Out) e entre novamente** para o GNOME Shell registrar o diretório da extensão, depois habilite:
> ```bash
> gnome-extensions enable lumen-spotlight@faeelviegas.github.io
> ```

### Opção 2: Instalar via Pacote `.shell-extension.zip`

1. Baixe `lumen-spotlight@faeelviegas.github.io.shell-extension.zip` na aba [Releases](https://github.com/FaeelViegas/lumen-spotlight/releases).
2. Instale pelo terminal:
   ```bash
   gnome-extensions install --force lumen-spotlight@faeelviegas.github.io.shell-extension.zip
   ```
3. Faça logoff e login novamente (na primeira instalação) e ative:
   ```bash
   gnome-extensions enable lumen-spotlight@faeelviegas.github.io
   ```

### Abrir Preferências
```bash
gnome-extensions prefs lumen-spotlight@faeelviegas.github.io
```

---

## 🛠️ Desenvolvimento e Testes

```bash
# Executar testes unitários (ranking, filtros, calculadora, conversor)
make test

# Executar benchmark de desempenho (< 50 ms memória / < 150 ms SQLite FTS5)
make benchmark

# Gerar pacote .zip compatível com extensions.gnome.org em dist/
make pack

# Testar em uma sessão Wayland isolada (Mutter Devkit do GNOME 50)
dbus-run-session -- gnome-shell --devkit

# Acompanhar logs do GNOME Shell em tempo real
journalctl -f -o cat /usr/bin/gnome-shell
```

---

## 📚 Documentação Adicional

- [Arquitetura e Modelo de Segurança](docs/ARCHITECTURE.md)
- [Guia de Desenvolvimento de Plugins](docs/PLUGINS.md)
- [Guia de Contribuição](CONTRIBUTING.md)
- [Histórico de Alterações](CHANGELOG.md)

---

## 📄 Licença

Distribuído sob a licença **GNU General Public License v3.0**. Consulte [LICENSE](LICENSE) para mais detalhes.
