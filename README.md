# tournament-board

A static poker tournament board: a big countdown timer in the center of the screen with the current small blind / big blind.

## Usage

Open `index.html` in a browser. No build step or server required.

| Key | Action |
|---|---|
| Space | Start / pause |
| → | Next level (stops the timer) |
| ← | Restart the current level; within its first second, go to the previous level (stops the timer) |
| F | Toggle fullscreen |
| L | Copy a link to the current state |
| S | Open / close the structure panel |
| Esc | Close the structure panel |

When a level ends, a beep plays and the next level starts automatically. The timer turns orange in the final minute.

Click or drag the progress bar under the timer to set the time remaining in the current level, to the nearest second. Left is the full level, right is the end. This works while paused or running, and it stops at 00:01 so dragging to the end doesn't skip the level. You can also Tab to the bar and use ←/→ (±10 s), Shift+←/→ (±1 min), Home (full time) and End (00:01).

### Mobile

The layout adapts to phones in both orientations: the timer and blinds scale to the screen, the controls become full-width touch buttons, and the structure panel opens full screen (two columns in landscape) with a ✕ to close it. Notched screens are handled with safe-area insets. On a phone you can use the browser's **Add to Home Screen** to run it full screen.

## Blind structure

Click the **Structure** tab on the right edge to slide out the structure editor. Edit small/big blinds and minutes per level, add levels (pre-filled at double the previous blinds) or breaks, remove rows, then click **Apply** (or press Enter in a field). The applied structure is saved in the browser's `localStorage`, so it survives reloads. **Load Default** puts the built-in structure into the editor. **New structure** (next to the Levels heading) empties the editor so you can build one from scratch. The board doesn't change until you Apply.

### Saved structures

At the top of the panel you can keep several named structures in the browser:

- **Save**: type a name and click Save (or press Enter) to store the structure currently in the editor. Saving under an existing name asks before overwriting.
- **Load**: pick a saved structure from the list and click Load. It goes into the editor; click **Apply** to use it.
- **Delete**: removes the selected saved structure, after a confirmation.

Saved structures live in this browser only (`localStorage`). They aren't shared between browsers or devices, and clearing site data removes them.

The built-in default is the `DEFAULT_LEVELS` array at the top of `app.js`. Each entry is `{ sb, bb, minutes }`, or `{ break: true, minutes }` for a break.

## Sharing a link

Click the link button in the top-right corner (or press **L**) to copy a URL that captures the current structure, level, and time remaining. Opening it restores that state, **paused**, so whoever opens it presses play to continue. The structure from the link becomes the active structure; your named saved structures are left alone. After loading, the parameters are removed from the address bar so a reload doesn't jump back to the snapshot.

URL format:

```
index.html?s=100-200-20_200-400-20_b10_300-600-20&l=3&t=754
```

| Param | Meaning |
|---|---|
| `s` | Structure. Entries joined by `_`; a level is `sb-bb-minutes`, a break is `b<minutes>` |
| `l` | Current entry, 1-based position in `s` (breaks count) |
| `t` | Seconds remaining in the current entry |

Each parameter is optional. Invalid values are ignored, and a notice says which ones were skipped.
