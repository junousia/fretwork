// Shared JSDoc typedefs (no runtime code). Imported for types only:
//   /** @typedef {import('./types.js').Voicing} Voicing */
export {};

/**
 * @typedef {object} Scale
 * @property {string} id
 * @property {string} name
 * @property {string} [short]
 * @property {string} [d]  one-line description
 * @property {number} [c]  commonness score used to rank suggestions
 * @property {number[]} iv  semitone intervals above the root
 */

/**
 * A parsed chord.
 * @typedef {object} Chord
 * @property {string} name   as typed, e.g. "F#m7b5"
 * @property {number} root   pitch class 0-11
 * @property {string} acc    accidental typed with the root ("#", "b" or "")
 * @property {number[]} iv   chord-tone intervals above the root
 * @property {number|null} bass  slash-chord bass pitch class
 * @property {string} suf    normalised suffix, a key of CHORDS
 */

/**
 * @typedef {object} Key
 * @property {number} t  tonic pitch class
 * @property {'major'|'minor'} mode
 */

/**
 * One position of a scale on a tuning. `s`/`e` are the fret range measured on
 * the lowest string; `deg` is the interval that anchors it.
 * @typedef {object} Position
 * @property {number} n    1-based position number
 * @property {number} deg
 * @property {number} s
 * @property {number} e
 */

/**
 * A chord fingering. `f`/`g` are indexed like the tuning (0 = top string);
 * f: absolute fret, 0 open, -1 muted; g: finger 1-4 or 0.
 * @typedef {object} Voicing
 * @property {number[]} f
 * @property {number[]} g
 * @property {{fret:number, from:number, to:number}|null} b  barre
 */

/**
 * Per-string frets: one Set of fret numbers per string, indexed like the tuning.
 * @typedef {Set<number>[]} FretSets
 */

/**
 * The player's current setup as the engines consume it.
 * @typedef {object} Instrument
 * @property {string} id            "guitar" | "ukulele"
 * @property {string} name
 * @property {number} audioOffset
 * @property {string} tuningId
 * @property {string} tuningName
 * @property {number} capo
 * @property {boolean} leftHanded
 * @property {number[]} midi        open-string MIDI notes incl. capo, top string first
 * @property {number[]} tuning      their pitch classes
 * @property {number[]} stringWidths
 * @property {number[]} standardPcs standard-tuning pitch classes of this instrument family
 */

/**
 * A scale suggested for a chord.
 * @typedef {object} Suggestion
 * @property {Scale} s
 * @property {number[]} abs   its notes as absolute pitch classes
 * @property {boolean} inKey
 * @property {boolean} inHarm
 * @property {boolean} extra  a "blues sound" extra, not strictly compatible
 * @property {number} score
 */

/**
 * The state carried in a share link (all but `text` optional).
 * @typedef {object} ProgressionLink
 * @property {string} text   the chord progression as typed
 * @property {string} [key]  "auto" or "<tonic>:<mode>"
 * @property {string} [instrument]
 * @property {string} [tuning]
 * @property {number} [capo]
 * @property {boolean} [leftHanded]
 * @property {Record<string, string>} [pick]  chord index -> scale id
 * @property {Record<string, 'all'|number|number[]>} [pos]  "chord|scale" -> position(s)
 * @property {Record<string, number>} [vo]    chord name -> voicing index
 */

/** A stored/instrument-like object with just what arpeggios need.
 * @typedef {{tuning:number[], midi:number[]}} Tuned
 */

/**
 * Options for board(). Everything is optional.
 * @typedef {object} BoardOptions
 * @property {number[]} [tuning]        pitch classes, top string first (default: standard guitar)
 * @property {number[]} [stringWidths]
 * @property {boolean} [showPositions]  draw position dividers and numbered badges
 * @property {Position[]} [positions]   the positions to draw dividers for
 * @property {{s:number, e:number}} [dimRange]  the selected position (highlights its badge)
 * @property {FretSets} [brightSets]    notes outside these are dimmed, not hidden
 * @property {Voicing} [voicing]        dim everything but this fingering; draws barre and X marks
 * @property {Voicing} [voicingRing]    ring this fingering without dimming anything else
 * @property {boolean} [fingerLabels]   label the fingering's dots with finger numbers
 * @property {boolean} [leftHanded]     mirror the neck
 * @property {number} [capo]            draw a capo bar instead of the nut
 */

/**
 * A tuning preset: open-string MIDI notes, top string first.
 * @typedef {object} TuningPreset
 * @property {string} id
 * @property {string} name
 * @property {number[]} midi
 */

/**
 * An instrument family and its tunings.
 * @typedef {object} Family
 * @property {string} id
 * @property {string} name
 * @property {number} audioOffset
 * @property {number[]} standard  standard-tuning open-string MIDI notes
 * @property {(n:number) => number[]} stringWidths
 * @property {TuningPreset[]} tunings
 */

/**
 * The saved setup.
 * @typedef {object} Setup
 * @property {string} instrument
 * @property {Record<string, string>} tunings  family id -> tuning id
 * @property {number} capo
 * @property {boolean} leftHanded
 */
