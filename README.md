# tournament-board

A static poker tournament board: a big countdown timer in the center of the screen with the current small blind / big blind.

## Usage

Open `index.html` in a browser. No build step or server required.

| Key | Action |
|---|---|
| Space | Start / pause |
| → / ← | Next / previous level |
| R | Reset current level timer |
| F | Toggle fullscreen |
| S | Open / close the structure panel |
| Esc | Close the structure panel |

When a level ends, a beep plays and the next level starts automatically. The timer turns orange in the final minute.

## Blind structure

Click the **Structure** tab on the right edge to slide out the structure editor. Edit small/big blinds and minutes per level, add levels (pre-filled at double the previous blinds) or breaks, remove rows, then click **Apply** (or press Enter in a field). The applied structure is saved in the browser's `localStorage`, so it survives reloads. **Load Default** puts the built-in structure into the editor.

### Saved structures

At the top of the panel you can keep several named structures in the browser:

- **Save**: type a name and click Save (or press Enter) to store the structure currently in the editor. Saving under an existing name asks before overwriting.
- **Load**: pick a saved structure from the list and click Load. It goes into the editor; click **Apply** to use it.
- **Delete**: removes the selected saved structure, after a confirmation.

Saved structures live in this browser only (`localStorage`). They aren't shared between browsers or devices, and clearing site data removes them.

The built-in default is the `DEFAULT_LEVELS` array at the top of `app.js`. Each entry is `{ sb, bb, minutes }`, or `{ break: true, minutes }` for a break.
