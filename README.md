# Smart Expense Tracker

This is now a deployable website, not only a local `file:///` page.

## Run On Your Computer

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Open On Phone While On Same Wi-Fi

1. Run `npm start` on the computer.
2. Find your computer's local IP address.
3. Open this on your phone:

```text
http://YOUR-COMPUTER-IP:3000
```

Example:

```text
http://192.168.1.5:3000
```

## Put It Online For Anyone

Upload these files to a Node hosting service such as Render, Railway, or Glitch:

- `index.html`
- `styles.css`
- `app.js`
- `server.js`
- `package.json`

Start command:

```bash
npm start
```

The server stores users and expenses in `data/database.json`.
