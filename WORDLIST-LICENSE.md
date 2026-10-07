# Wordbook content attribution

The assembled wordbook content in `server/wordbook-catalog.js`,
`server/ielts-wordbook.js` and `server/data/ielts-expanded.json`, including
Chinese glosses added or adapted by Small Steps, is distributed under
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
This notice applies to the vocabulary content; it does not assign a license to
unrelated application code.

## Sources

| Collection in Small Steps             | Original list and authors                                                     | Original source                                                |
| ------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| NGSL 日常核心精选 (40 selected words) | New General Service List 1.2; Charles Browne, Brent Culligan, Joseph Phillips | https://www.newgeneralservicelist.com/new-general-service-list |
| BSL 商务表达精选 (40 selected words)  | Business Service List 1.2; Charles Browne, Brent Culligan                     | https://www.newgeneralservicelist.com/business-service-list    |
| NAWL 学术阅读精选 (40 selected words) | New Academic Word List 1.2; Charles Browne, Brent Culligan, Joseph Phillips   | https://www.newgeneralservicelist.com/new-academic-word-list   |
| 日常实用短语 (30 phrases)             | Original selection and Chinese glosses by Small Steps                         | `server/wordbook-catalog.js`                                   |
| 雅思备考主题精选 (6,512 entries)      | NGSL/NAWL authors above; ECDICT contributors; Small Steps                     | `server/ielts-wordbook.js`, `server/data/ielts-expanded.json`  |

Each original list's website explicitly provides the list under CC BY-SA 4.0.
The headwords in all three adapted collections were checked against the linked
official downloadable CSV files on 2026-09-29; all 120 selected headwords occur
in their corresponding source. Download URLs are stored in the catalog.

The IELTS collection combines 120 original entries (80 words and 40 collocations)
with 6,392 additional dictionary entries. The original examples are authored
teaching scenarios. It is not an official IELTS list, reproduced exam material,
or a guarantee of any band score.

## Expanded IELTS collection

- NGSL 1.2 and NAWL 1.2 headword selections: Charles Browne, Brent Culligan,
  Joseph Phillips; CC BY-SA 4.0, source links above.
- Chinese dictionary glosses, part-of-speech labels, phonetics and community IELTS tags:
  [ECDICT](https://github.com/skywind3000/ECDICT),
  commit `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`.
  ECDICT is MIT licensed; the complete upstream copyright and permission
  notice is retained in [licenses/ECDICT-MIT.txt](licenses/ECDICT-MIT.txt).
  The MIT notice and permissions continue to apply to the ECDICT material.
- Small Steps: tier grouping, cross-source deduplication, explicit inflection
  collapsing, glossary cleanup and a small set of common-word corrections.
  The assembled adaptation is provided under CC BY-SA 4.0.

The build reads 2,809 NGSL rows and 959 NAWL teaching headwords. The NAWL download
has 959 rows despite the website overview stating 957; the actual input is pinned
by SHA-256. Every original headword is considered; overlaps are assigned to the
earlier retained layer. ECDICT community IELTS labels do not establish official
exam coverage. Dictionary translations are automatically cleaned and have not
all been manually reviewed. Added entries do not include manufactured examples.

Part-of-speech labels are extracted from the retained Chinese dictionary sense
lines, normalized (for example `a.` to `adj.`), and stored separately from the
gloss. Explicit corrections and missing-label supplements are recorded in
`manifest.partOfSpeechOverrides`. Selected original entries and phrases use
Small Steps annotations in `server/curated-parts-of-speech.js`, based on their
selected meanings; these annotations also use CC BY-SA 4.0.

The exact URLs, checksums, source row counts, layer counts, collapsed inflections
and glossary overrides are recorded in the generated JSON `manifest`.
Reproduce with `npm run build:lexicon` (Python 3.8+ and Node.js 24).

## Modifications

For the three 40-word selected collections, Small Steps selects a subset of headwords, changes their ordering, and adds
Chinese glosses focusing on common meanings. The original datasets' definitions,
frequency statistics, and teaching materials are not reproduced. These collections
are not the full original lists, official translations, or endorsed products.
The NAWL and BSL collections share the word “allocation”; identical headword and
gloss pairs can share a learner card while keeping both source memberships.

When redistributing or adapting this vocabulary content, retain attribution,
provide a link to the license, indicate changes, and license adaptations under
CC BY-SA 4.0. No additional restrictions are imposed on recipients.
