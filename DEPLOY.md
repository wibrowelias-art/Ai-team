# Deploy NEON HQ to Vercel (no GitHub needed)

You need Node.js 20 or newer (`node -v`) and a free Vercel account.

1. **Unzip** `neon-hq.zip` and open a terminal in the `neon-hq` folder.

2. **Log in to Vercel** (opens your browser once):

   ```bash
   npx vercel login
   ```

3. **Create the project and deploy a preview:**

   ```bash
   npx vercel
   ```

   Accept the defaults. Vercel detects Next.js by itself; no settings to change.

4. **Add your Gemini key** (optional, the game works without it using scripted replies):

   ```bash
   npx vercel env add GEMINI_API_KEY production
   ```

   Paste the key when asked. You can also add it in the dashboard: Project → Settings → Environment Variables.

5. **Deploy to production:**

   ```bash
   npx vercel --prod
   ```

   The command prints your live URL.

To ship a new version later, run `npx vercel --prod` again from the same folder.

## Run it locally first (optional)

```bash
npm install
cp .env.example .env.local   # then put your key after GEMINI_API_KEY=
npm run dev                  # http://localhost:3000
```

## Notes

- Never put the key in the code or commit `.env.local`. It is only read on the server.
- The zip has no `node_modules` or build output; Vercel installs and builds it.
- NEON HQ is a game. All money and workers are fictional.
