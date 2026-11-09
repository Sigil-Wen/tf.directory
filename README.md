# tf.directory

An independent directory of every Thiel Fellow since 2011, by class, company and profile, with a valuation leaderboard and a "which class won?" ranking.

Live at **https://tf.directory** (GitHub Pages).

## How it works

A static site with no build step:

- `index.html`: the app shell
- `assets/app.js`: hash-routed views (`#/leaderboard`, `#/unicorns`, `#/classes`, `#/class/2012`, `#/companies`, `#/company/figma`, `#/fellows`, `#/fellow/dylan-field`) and the `/` search palette
- `assets/style.css`: styles, light and dark themes, and the self-hosted Geist font (OFL)
- `assets/people/`, `assets/logos/`: portraits and company logos, referenced by the `photo` and `logo` fields
- `data/fellows.json`: one record per fellow (class, current company and role, bio, links, sources, confidence)
- `data/companies.json`: one record per company (fellows and their `titles`, status, latest valuation, peak valuation with `peakNote`, sources)

To fix or add a fellow, edit the JSON. After changing `app.js` or `style.css`, bump the `?v=` number on both in `index.html` so browsers fetch the new files. Each company lists its fellows by `id`, and the app builds the links between fellows and companies at load time.

## Contributing

Pull requests are welcome: add a missing fellow, update a valuation or improve the site. Every fact needs a public source. [CONTRIBUTING.md](CONTRIBUTING.md) explains the data fields and the check that runs on each pull request:

```sh
python3 .github/scripts/check_data.py
```

## Local preview

```sh
python3 -m http.server 4173
```

Then open http://127.0.0.1:4173.

## Data sources

- **Rosters:** the Thiel Foundation's class announcements on Business Wire (2015–2026, several read through Wayback Machine copies) and archived snapshots of thielfellowship.org's fellows pages (2011–2014). The 2011–2020 total (226) matches the Foundation's own count.
- **Companies:** the official Thiel Fellow job board (thielfellowship.org/jobs), company sites, Y Combinator pages and press coverage.
- **Valuations:** the latest public figure for each company: last priced round, public market cap, token market cap or acquisition price. The peak is the highest figure a company ever reached (a priced round, an IPO or SPAC deal, its highest market cap, a token all-time high or a sale price); the leaderboard can rank by either. Figures marked "Dealroom estimate" come only from Dealroom's Thiel Fellowship chart and are less certain. Defunct companies keep only their peak value.
- **Billionaires:** Forbes real-time profiles.
- **Portraits:** public X profile pictures. A portrait is only used when the account matches the fellow by name and by company or fellowship mentions in its bio, or after a manual check. Fellows without a confirmed account show initials.
- **Logos:** each company's own site icon, or its official X avatar. Logos belong to their owners.

Classes are labeled by the year they were announced. The class announced in January 2022 is labeled 2022, although some of its fellows call themselves 2021 fellows.

## License

The code and the data in `data/` are under the [MIT License](LICENSE). Portraits in `assets/people/` and logos in `assets/logos/` belong to their owners and aren't covered by it, and the Geist font in `assets/fonts/` is under the SIL Open Font License.

Not affiliated with the Thiel Foundation.
