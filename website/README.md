# mcplens.tech — landing site

The marketing landing page for mcplens. Plain static HTML + CSS, **no build step**.

```
website/
├── index.html      # the page
├── styles.css      # Editorial Light design system
├── favicon.svg     # lens/aperture mark
├── og.png          # 1200x630 social-share image
├── og.svg          # source for og.png (re-render if you edit copy)
├── robots.txt
├── sitemap.xml
└── vercel.json      # clean URLs + cache/security headers
```

## Preview locally

No tooling needed — serve the folder with anything:

```sh
cd website
python3 -m http.server 4321
# open http://localhost:4321
```

## Deploy to Vercel

The site lives in the `website/` subfolder of this repo, so point Vercel at that
subdirectory:

1. Go to **vercel.com → Add New → Project** and import the `mcplens-cli` GitHub repo.
2. Set **Root Directory** to `website`.
3. **Framework Preset:** Other (it's static — no build command, no output dir).
4. Click **Deploy**. Every push to `main` redeploys automatically.

## Custom domain (mcplens.tech)

1. In the Vercel project → **Settings → Domains**, add `mcplens.tech`.
2. Vercel shows the exact DNS records. At your domain registrar, either:
   - set Vercel's **nameservers**, or
   - add the **A record** (`76.76.21.21`) for the apex and a **CNAME**
     (`cname.vercel-dns.com`) for `www`.
3. Wait for DNS to propagate and the TLS cert to issue (usually minutes).

## Editing the social image

`og.png` is rendered from `og.svg`. If you change the headline, re-render: open
`og.svg` at a 1200x630 viewport in a browser and screenshot it, replacing `og.png`.
