# PrintCV

A free CV builder for students of the 42 Network. Live at **[printcv.me](https://printcv.me)**.

Log in with your 42 account, choose the projects you want to show, write what **you** did, and download a clean one-page PDF or Word file.

[![CI](https://github.com/alinassarr/PrintCv-V2/actions/workflows/ci.yml/badge.svg)](https://github.com/alinassarr/PrintCv-V2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it does

- **Log in with 42.** Your name, campus, level, finished projects and skills are filled in for you. Nothing is made up: a project only shows up if 42 says you passed it.
- **Help me write.** For each project, PrintCV asks a few short questions about what you did. It then makes a message you can paste into any AI chat (ChatGPT, Claude, Gemini, or another). You paste the answer back, and PrintCV turns it into CV lines. Because the message is built from your own answers, your lines are different from everyone else's.
- **Checks as you type.** Each line shows if it starts with a strong verb, has a number, or uses "I", "my" or "we". It also warns you when a line looks like the same line many other students use.
- **An honest score.** An empty CV scores 0. Points only come from things you have really done: your details, 2 to 4 lines per project, your own words, real numbers, and fitting on one page.
- **Match a job.** Paste a job post to see which tools it asks for and which ones your CV already has.
- **One page, ready to send.** Download as PDF (from the print window, choose "Save as PDF") or as a Word file.

## Your data

- There is **no database**. Your CV is saved only in your own browser (local storage).
- Logging in with 42 sets one signed cookie that holds your public 42 profile for up to 24 hours. PrintCV never sees your 42 password.
- PrintCV does not send your CV to any AI service. With "Help me write", **you** choose where to paste the message.

## Run it on your computer

You need [Node.js](https://nodejs.org/) 18.18 or newer (20 is best).

```bash
git clone https://github.com/alinassarr/PrintCv-V2.git printcv
cd printcv
npm install
cp .env.example .env.local   # then fill in the values, see below
npm run dev
```

Open http://localhost:3000.

### Settings (`.env.local`)

| Name | What it is |
| --- | --- |
| `APP_URL` | The address of the app, with `https://` and no `/` at the end. Local: `http://localhost:3000`. |
| `SESSION_SECRET` | A long random text (32+ characters) used to sign the login cookie. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `FORTY_TWO_CLIENT_ID` | From your app at [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications). |
| `FORTY_TWO_CLIENT_SECRET` | From the same page. Never share it or commit it. |
| `FORTY_TWO_API_BASE` | Optional. Leave empty. |

In your 42 app, set the redirect URI to `<APP_URL>/api/auth/callback/42-school` and the scope to `public`.

You can use the editor without logging in. Only the "Log in with 42" button needs these settings.

## Put it online (Vercel)

1. Import the repo in [Vercel](https://vercel.com/new). It finds Next.js by itself.
2. In **Settings → Environment Variables**, add `APP_URL`, `SESSION_SECRET`, `FORTY_TWO_CLIENT_ID` and `FORTY_TWO_CLIENT_SECRET`.
3. Add your domain, and make sure your 42 app's redirect URI uses that domain.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app for local work |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code style |
| `npm test` | Run the tests |

## How the code is laid out

```
src/
  app/                     Pages and the 3 login routes (/api/auth/...)
  components/studio/       The editor: sections, line editor, Help me write, score
  components/templates/    The CV page itself, plus the copy used for printing
  lib/intra/               Talking to 42 and turning a 42 profile into a CV
  lib/project-guide.ts     Short notes and questions for each 42 project
  lib/bullet-helper.ts     Builds the AI message, reads the reply, checks lines
  lib/cv-score.ts          The score and the job post match
  lib/docx-generator.ts    The Word file
  lib/store/cv-store.ts    Saving the CV in your browser
test/                      Tests (run with npm test)
```

## Help make it better

Issues and pull requests are welcome. If a 42 project is missing from the "Help me write" questions, add it to `src/lib/project-guide.ts`. Please run `npm run typecheck`, `npm run lint` and `npm test` before you open a pull request.

## License

[MIT](LICENSE)
