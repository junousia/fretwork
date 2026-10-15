# Third-party notices

## Chord voicings - chords-db (MIT)

`site/data/voicings.json` is derived from
[tombatossals/chords-db](https://github.com/tombatossals/chords-db), converted and validated by
`tools/build-voicings.mjs`.

> MIT License - Copyright (c) 2016 David Rubert
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions: The above copyright notice
> and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Font - Familjen Grotesk (SIL Open Font License 1.1)

`site/fonts/` contains Familjen Grotesk, Copyright 2021 The Familjen Grotesk Project Authors
(https://github.com/Familjen-Sthlm/Familjen-Grotesk). Full licence text: `site/fonts/OFL.txt`.

## Sound

The plucked-guitar voice (`site/string-dsp.js`) is our own implementation of the Karplus-Strong plucked-string
algorithm (K. Karplus and A. Strong, 1983, with the extensions of D. Jaffe and J. O. Smith, 1983). No third-party audio
code or samples are included.

## Statistics from real solos - Weimar Jazz Database (ODbL / DbCL)

The solo generator's defaults were tuned to statistics measured on the Weimar Jazz Database v2.1 (Jazzomat Research Project,
Hochschule fuer Musik Franz Liszt Weimar; <https://jazzomat.hfm-weimar.de/>), released under the Open Database License 1.0 with
contents under the Database Contents License. Only a handful of derived numbers (percentages) appear in the tests and notes; no
solo, note or transcription from the database is included in this repository or in the app. Please cite: Pfleiderer, Frieler,
Abesser, Zaddach, Burkhart (eds.), *Inside the Jazzomat: New Perspectives for Jazz Research*, Schott Campus, 2017.

## Chord changes of well-known tunes and songs

The chord sequences in the Load menu (Classics and Songs) are the harmonic skeletons of well-known tunes, written as degrees. Chord progressions are
not protected expression; no melody, lyrics or arrangement is included. The jazz tunes marked in CHANGELOG 2.2.0 were derived from the Weimar Jazz
Database's chord annotations (see above); Blue Bossa, The Girl from Ipanema, Fly Me to the Moon and the pop, rock and folk songs were checked against
several published lead sheets and chord charts.

## Concepts

Scale-position conventions follow published guitar pedagogy (the CAGED pentatonic boxes and
William Leavitt's *A Modern Method for Guitar*, Berklee Press); no text or diagrams from those
works are reproduced.
