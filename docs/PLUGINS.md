# Plugin Development Guide

Lumen Spotlight supports external plugins written as **GJS ES Modules** (`.js`), loaded automatically from `~/.local/share/lumen/plugins/` or registered dynamically at runtime via `global.lumenPluginRegistry`.

---

## Plugin Contract

Each plugin object must follow this interface:

```js
export default {
    id: 'my-plugin',
    title: 'My Custom Plugin',
    prefix: 'mp ', // Optional exclusive prefix (e.g. 'mp ', ':', '>')

    /**
     * @param {string} query - Raw search text typed by the user
     * @param {Gio.Cancellable} cancellable - Cancellation signal for aborted searches
     * @returns {Promise<Array<ResultItem>>}
     */
    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const term = query.replace(/^mp\s+/i, '').trim();
        if (!term)
            return [];

        return [
            {
                id: `my-plugin:${term}`,
                category: 'plugins',
                categoryLabel: 'My Plugin',
                title: `Run action for "${term}"`,
                subtitle: 'Custom plugin result',
                iconName: 'system-run-symbolic',
                score: 900,
                onActivate: () => {
                    log(`[MyPlugin] Activated with: ${term}`);
                },
            },
        ];
    },

    // Optional custom activation handler (falls back to result.onActivate())
    activate(result, modifiers) {
        result?.onActivate?.(modifiers);
    },

    // Optional cleanup called when the extension is disabled
    destroy() {},
};
```

---

## Result Item Schema

| Property | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Yes | Unique identifier (used for ranking & usage tracking) |
| `title` | `string` | Yes | Primary display text |
| `subtitle` | `string` | No | Secondary description shown below title |
| `category` | `string` | No | Grouping key (e.g. `'plugins'`) |
| `categoryLabel` | `string` | No | Section header label shown in the list |
| `iconName` | `string` | No | Symbolic or themed icon name |
| `gicon` | `Gio.Icon` | No | Custom `Gio.Icon` instance |
| `score` | `number` | No | Base relevance score |
| `preview` | `object` | No | Optional preview metadata (`{ type, text, metadata }`) |
| `onActivate` | `function` | No | Callback executed when pressing `Enter` or clicking |

---

## Installing a User Plugin

1. Create the plugins directory:
   ```bash
   mkdir -p ~/.local/share/lumen/plugins
   ```
2. Save your `.js` module inside `~/.local/share/lumen/plugins/my-plugin.js`.
3. Restart your GNOME Shell session (or disable/enable the extension) to load the plugin.

---

## Dynamic Registration (For Other Extensions)

External GNOME extensions can also register or unregister providers at runtime:

```js
if (global.lumenPluginRegistry) {
    global.lumenPluginRegistry.register(myPlugin);
}
```
