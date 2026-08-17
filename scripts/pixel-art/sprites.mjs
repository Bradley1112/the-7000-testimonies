// Sprite definitions for the 1 Kings 18-19 pixel sequence.
//
// Each sprite is an array of equal-length strings, one character per pixel.
// '.' is transparent. Every other character is a key into the scene's palette,
// so the same silhouette can be recoloured per scene without redrawing it.
//
// Kept deliberately small and blocky. At 8-bit scale a readable silhouette beats
// detail; anything under ~16px tall that tries to render a face turns to mush.

/** Elijah, arms raised over the altar. Scene 1. 15w x 22h */
export const ELIJAH_ARMS_RAISED = [
  '...............',
  '.....HHHHH.....',
  '....HHHHHHH....',
  '....HHFFFHH....',
  '....HHFFFHH....',
  '.....HFFFH.....',
  '......SSS......',
  'A.....SSS.....A',
  'AA...RRRRR...AA',
  '.AA.RRRRRRR.AA.',
  '..AARRRRRRRAA..',
  '...RRRRRRRRR...',
  '...RRRRRRRRR...',
  '...RRRRRRRRR...',
  '...RRRRRRRRR...',
  '...RRRRRRRRR...',
  '....RRRRRRR....',
  '....RRR.RRR....',
  '....RRR.RRR....',
  '....LLL.LLL....',
  '....LLL.LLL....',
  '...BBBB.BBBB...',
];

/** Elijah running, exhausted, leaning forward. Scene 2. 17w x 20h */
export const ELIJAH_RUNNING = [
  '.................',
  '.......HHHHH.....',
  '......HHHHHHH....',
  '......HHFFFHH....',
  '......HHFFFHH....',
  '.......HFFFH.....',
  '.....A..SSS......',
  '....AA.RRRRR.....',
  '...AA.RRRRRRR....',
  '..AA.RRRRRRRRA...',
  '.....RRRRRRRAA...',
  '.....RRRRRRRA....',
  '.....RRRRRRR.....',
  '.....RRRRRRR.....',
  '.....RRR.RRR.....',
  '....LLL...LLL....',
  '...LLL.....LLL...',
  '..LLL.......LL...',
  '.BBB.........BB..',
  '.................',
];

/** Elijah huddled in the cave, knees up, back to the wall. Scene 3. 16w x 16h */
export const ELIJAH_HUDDLED = [
  '................',
  '.....HHHHH......',
  '....HHHHHHH.....',
  '....HHFFFHH.....',
  '....HHFFFHH.....',
  '.....HFFFH......',
  '......SSS.......',
  '....RRRRRRR.....',
  '...RRRRRRRRR....',
  '..RRRRRRRRRRR...',
  '..RRRRRRRRRRR...',
  '..RRRRRRRRRRR...',
  '..RRRLLLLLRRR...',
  '..RRLLLLLLLRR...',
  '..BBLLLLLLLBB...',
  '................',
];

/**
 * Elijah at the cave mouth, face covered by his cloak. Scene 4. 15w x 22h
 * D marks the fold shadows. A flat single-tone cloak rendered as a featureless
 * slab at banner scale — the folds are what make it read as cloth over a person.
 */
export const ELIJAH_CLOAKED = [
  '...............',
  '....CCCCCCC....',
  '...CCCDCCDCC...',
  '..CCCCDCCDCCC..',
  '..CCCCDCCDCCC..',
  '..CCCCCCCCCCC..',
  '..CCCDCCCCDCC..',
  '..CCCDCCCCDCC..',
  '.CCCCDCCCCDCCC.',
  '.CCCCDCCCCDCCC.',
  '.CCCCCDCCDCCCC.',
  '.CCCCCDCCDCCCC.',
  '.CCCCCDCCDCCCC.',
  '.CCCCDCCCCDCCC.',
  '.CCCCDCCCCDCCC.',
  '..CCCDCCCCDCC..',
  '..CCCCDCCDCCC..',
  '..CCCC...CCCC..',
  '..CCDC...CDCC..',
  '..LLLL...LLLL..',
  '..LLLL...LLLL..',
  '.BBBBB...BBBBB.',
];

/** A prophet of Baal, thrown backward. Scene 1. 13w x 14h */
export const PROPHET_FALLING = [
  '.............',
  '..........PPP',
  '.........PPPP',
  '........PPPPP',
  '..A....PPPPP.',
  '.AA...PPPPP..',
  'AA...PPPPP...',
  '....PPPPP....',
  '...PPPPP.....',
  '..PPPPP...AA.',
  '.LLLL....AA..',
  'LLL.....AA...',
  'LL...........',
  '.............',
];

/**
 * The stone altar, soaked with water. Scene 1. 28w x 14h
 * Built as a stepped cairn rather than a slab on a pedestal — an early version
 * read as a flying saucer because the top course overhung the base.
 * T = wood on top, S = stone, M = mortar/shadow course, W = water pooled at the foot.
 */
export const ALTAR = [
  '.........TTTTTTTTTT.........',
  '........TTTTTTTTTTTT........',
  '.......SSSSSSSSSSSSSS.......',
  '.......SS.SSSS.SSSS.S.......',
  '......SSSSSSSSSSSSSSSS......',
  '......S.SSSS.SSSS.SSSS......',
  '.....SSSSSSSSSSSSSSSSSS.....',
  '.....SSSS.SSSS.SSSS.SSS.....',
  '....SSSSSSSSSSSSSSSSSSSS....',
  '....S.SSSS.SSSS.SSSS.SSS....',
  '...SSSSSSSSSSSSSSSSSSSSSS...',
  '...MMMMMMMMMMMMMMMMMMMMMM...',
  '..WWWWWWWWWWWWWWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWWWWWWWWWWWWWW.',
];

/** The broom tree Elijah collapses under. Scene 2. 19w x 18h */
export const BROOM_TREE = [
  '.......GGG.........',
  '.....GGGGGGG.......',
  '...GGGGGGGGGGG.....',
  '..GGGGGGGGGGGGG....',
  '.GGGGGGGGGGGGGGG...',
  '.GGGGGGGGGGGGGGG...',
  '..GGGGGGGGGGGGG....',
  '...GGGGGGGGGGG.....',
  '.....GGG.GGG.......',
  '.......TT..........',
  '.......TT..........',
  '.......TT..........',
  '......TTT..........',
  '......TT...........',
  '.....TTT...........',
  '.....TT............',
  '....TTTT...........',
  '...................',
];

/**
 * One of the 7,000 — a plain standing figure. Scene 4 renders many of these at
 * low opacity behind Elijah. 7w x 12h, small enough to tile densely.
 */
export const FAITHFUL_SILHOUETTE = [
  '..FFF..',
  '..FFF..',
  '.FFFFF.',
  'FFFFFFF',
  'FFFFFFF',
  'FFFFFFF',
  '.FFFFF.',
  '.FFFFF.',
  '.FF.FF.',
  '.FF.FF.',
  '.FF.FF.',
  'FFF.FFF',
];
