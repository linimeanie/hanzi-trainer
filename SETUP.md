# 汉字 тренажёр — как запустить

The whole app is the `app/` folder: plain HTML/CSS/JS, no build step.
It installs on the phone home screen and works offline.

## 1. Try it locally

```bash
node tools/serve.js
```

Open http://localhost:8777.

## 2. Online

Live at **https://linimeanie.github.io/hanzi-trainer/** (repo: github.com/linimeanie/hanzi-trainer).
Every push to `main` redeploys the `app/` folder automatically via `.github/workflows/pages.yml`.

### How it was set up (for reference)

1. Create a GitHub repository, e.g. `hanzi-trainer` (it can be private on a paid plan; public is fine — the word list holds nothing personal).
2. Upload the contents of `app/` to the repository root (or the whole project and set Pages to serve `/app` via a workflow).
3. Repository → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. After a minute the app is live at `https://<your-username>.github.io/hanzi-trainer/`.

Alternative with no account setup: drag the `app` folder onto https://app.netlify.com/drop.

**On the iPhone:** open the link in Safari → Share → *На экран «Домой»*.

## 3. Sync phone ↔ laptop (Supabase, free)

1. Create a project at https://supabase.com (free tier).
2. SQL Editor → paste `supabase.sql` → Run.
3. Authentication → URL Configuration → *Site URL*: your GitHub Pages link. Add it under *Redirect URLs* too.
4. Project Settings → API: copy **Project URL** and the **anon public** key into `app/config.js`.
5. Commit and push `config.js` (the anon key is meant to be public; row-level security protects the data). In the app: ⚙︎ → enter your email → open the login link on **each** device.

Progress syncs automatically a few seconds after each answer and when the app is reopened.
Without sync, progress lives in that browser only; ⚙︎ → *Скачать прогресс* makes a backup file.

## 4. Adding words

**In the app:** Слова → «＋ Добавить слово». Pinyin fills itself (check the tones). Added words are stored in your progress (synced), shown as «Мои слова» and count as 🟢 together with the newest notebook class.

**From photos:** send Claude the photo/screenshot of the new notes. It appends a block to `data/words.tsv`:

```
#L	24	C-01	2026-11-20
新词	xīn cí	новое слово	new word
S	例句。	Lìjù.	Пример.	Example.
```

then runs `python3 tools/build_data.py` (regenerates `app/data.js`), commits and pushes — the site updates in about a minute.
The newest notebook class (plus words added in the app since then) is 🟢, the three lessons before it 🟠, everything older 🔴.
New Russian glosses for character parts go into `data/glosses_ru.txt`; the build script lists any that are missing.

## How words are chosen

- **Тренировка дня**: 60% from the latest lesson, 25% from the three before, 15% older.
- Inside each colour: words that are due, new, or recently missed come first (Leitner boxes: 1, 2, 4, 8, 16, 32, 64 days).
- A miss sends the word back to box 0, so it comes up again right away, whatever its colour.
- A word counts as **освоено** at box 4 (answered right 4 times in a row, spaced out).
- **Уроки 👑**: up to 25 of the lesson's weakest words; 90% correct earns the crown.
