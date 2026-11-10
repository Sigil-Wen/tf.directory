# Contributing to tf.directory

Pull requests are welcome, from a one-line fix to a whole new class. You can:

- add a fellow who is missing, or fix a class year, company, title or bio
- update a valuation after a new round, IPO, acquisition or shutdown
- add a portrait or company logo
- improve the site itself: layout, charts, accessibility, speed

Not sure about a fix, or don't have a source handy? [Open an issue](https://github.com/Sigil-Wen/tf.directory/issues/new) instead.

## The quickest way: edit on GitHub

Every fellow and company page on tf.directory has a **Suggest an edit** link. It opens the right data file in GitHub's editor, which forks the repository for you and turns your change into a pull request. Search the file for the id it names, such as `"lucy-guo"`, make the change, and add your source.

## Ground rules

1. **Every fact needs a public source.** Add the link to the record's `sources` list: a Thiel Foundation class announcement, press coverage, a company filing, the company's own site, or the fellow's own public profile. Pull requests without sources can't be merged.
2. **Valuations are company values, not personal net worth.** Use the latest public figure: last priced round, market cap, token market cap or acquisition price. Say what it is and when in `valuationNote`, like `Last round · May 2026`. Keep the highest figure the company ever reached in `peakValuationUSD`, with a `peakNote`.
3. **Nothing private.** No personal email addresses, phone numbers or home addresses, and nothing a fellow hasn't made public themselves.
4. **Portraits** must come from the fellow's own public profile, square, saved as `assets/people/<fellow-id>.jpg`. **Logos** come from the company's own site or official account, saved as `assets/logos/<company-id>.png`.

## The data files

All of the directory lives in two JSON files. Keep their formatting: one-space indents and plain UTF-8 characters.

**`data/fellows.json`**, one record per fellow:

| Field | What it holds |
|---|---|
| `id` | lowercase and hyphenated, like `dylan-field`; used in the page URL |
| `name`, `class` | full name, and the year the class was announced |
| `company`, `role`, `companyUrl` | current company, role there and its site |
| `sector` | one of the sectors already used in the file |
| `bio`, `previous` | a short factual bio, and earlier companies or roles |
| `location`, `x`, `linkedin`, `website` | public profile details; `x` is the handle without `@` |
| `photo` | path to the portrait, if there is one |
| `sources` | public links backing the record |
| `confidence` | `high`, `medium` or `low`: how sure we are of the class year |

If you add a fellow, also raise `meta.count` at the top of the file.

**`data/companies.json`**, one record per company:

| Field | What it holds |
|---|---|
| `id`, `name`, `url`, `sector` | as above |
| `status` | `private`, `public`, `acquired`, `defunct`, `nonprofit` or `protocol` |
| `fellows`, `titles` | ids of the fellows behind it, and each fellow's title there |
| `valuationUSD`, `valuationNote`, `valuationDate`, `valuationDetail` | the latest public value in US dollars, and what it is |
| `peakValuationUSD`, `peakNote`, `peakDate` | the highest value it ever reached |
| `rounds` | optional: priced rounds, oldest first, each with `date`, `round`, `valuationUSD`, `raisedUSD` and a `source`; the company page charts them, and rankings show the rise since the round before |
| `totalRaisedUSD`, `unicorn` | money raised, and whether it was ever valued at $1B or more |
| `logo`, `logoDark` | path to the logo; set `logoDark` for a white logo |
| `sources` | public links backing the figures |

Dates look like `2026-05`. Amounts are plain numbers of US dollars: `3250000000`, not `3.25B`.

## Before you open the pull request

Run the same check the pull request will run:

```sh
python3 .github/scripts/check_data.py
```

It catches broken ids, missing sources, bad links, wrong dates and missing image files. To see your change on the site, preview it locally:

```sh
python3 -m http.server 4173
```

Then open http://127.0.0.1:4173. If you changed `assets/app.js` or `assets/style.css`, bump the `?v=` number on both in `index.html` so browsers fetch the new files.

## License

By opening a pull request, you agree that your contribution is shared under the project's [MIT License](LICENSE).
