'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

/**
 * The 1 Kings 18-19 pixel journey.
 *
 * Structure, per the brief: a short Scene 4 cold open as a teaser, then the
 * full story in chronological order (1 -> 2 -> 3 -> 4), with Scene 4 landing
 * again as the resolution now that it has been earned narratively.
 *
 * Animation is triggered by IntersectionObserver adding `.is-visible` to a
 * section, which starts CSS keyframes defined in globals.css. Nothing animates
 * on page load, and nothing animates off-screen.
 *
 * Replay behaviour: the sequence plays once per visitor. The flag lives in
 * localStorage, so a returning reader lands on the ordinary homepage with a
 * small "replay" affordance rather than being walked through it again.
 */

const SEEN_KEY = 'the7000:story-seen-v1';

interface SceneDef {
  id: string;
  src: string;
  /** Alt text carries the narrative for screen readers, which cannot see the art. */
  alt: string;
  reference: string;
  heading: string;
  body: string;
  /** Extra class driving that scene's ambient animation. */
  effect?: string;
}

const SCENES: SceneDef[] = [
  {
    id: 'carmel',
    src: '/scenes/scene-1-fire.svg',
    alt:
      'Pixel art: a vast column of fire falls from the sky onto a water-soaked stone altar. ' +
      'Elijah stands alone on the left with his arms raised. On the right, the prophets of ' +
      'Baal are thrown backward.',
    reference: '1 Kings 18',
    heading: 'The fire on Carmel',
    body:
      'Elijah stood against four hundred and fifty prophets, drenched the altar with water, ' +
      'and asked God to answer. Fire fell. The whole nation saw it and fell on their faces.',
    effect: 'scene-flicker',
  },
  {
    id: 'desert',
    src: '/scenes/scene-2-desert.svg',
    alt:
      'Pixel art: Elijah runs alone across empty sand dunes under a harsh white sun, ' +
      'exhausted and slumped forward. A single broom tree stands far off in the distance.',
    reference: '1 Kings 19',
    heading: 'The run into the desert',
    body:
      'One threat from Jezebel, and the man who had just called down fire ran for his life. ' +
      'He collapsed under a broom tree and asked God to let him die. Victory had not made him ' +
      'immune to despair.',
    effect: 'scene-pulse',
  },
  {
    id: 'cave',
    src: '/scenes/scene-3-cave.svg',
    alt:
      'Pixel art: a cross-section of a mountain cave. Elijah is huddled inside. Outside, three ' +
      'forces pass in sequence: a tearing wind, an earthquake splitting the ground, and a wall ' +
      'of fire.',
    reference: '1 Kings 19',
    heading: 'Wind, earthquake, fire',
    body:
      'A great wind tore the mountains apart, but God was not in the wind. Then an earthquake, ' +
      'but God was not in the earthquake. Then a fire, but God was not in the fire. ' +
      'The spectacular was not the point.',
  },
];

/** The line the whole project is named for. */
const WHISPER_LINE = 'Yet I have reserved 7,000 in Israel who have not bowed to Baal.';

function DialogueBox({ children, cue }: { children: React.ReactNode; cue?: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="border-4 border-white bg-[#0d1424]/95 p-4 shadow-[0_0_0_4px_#454B1B] sm:p-6">
        <p className="font-pixel text-[0.6rem] leading-[1.9] text-white sm:text-xs sm:leading-[2.1]">
          <span className="typewriter inline-block align-top">{children}</span>
        </p>
        {cue && (
          <p className="mt-4 flex items-center gap-2 font-pixel text-[0.5rem] text-green-300 sm:text-[0.6rem]">
            <span aria-hidden="true" className="animate-pulse">▼</span> {cue}
          </p>
        )}
      </div>
    </div>
  );
}

/** One full-viewport scene that animates when it scrolls into view. */
function Scene({
  children, className = '',
}: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If the browser lacks IntersectionObserver, show everything immediately
    // rather than leaving the scenes invisible.
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }

    const obs = new IntersectionObserver(
      ([entry]) => {
        // One-way: once a scene has played we leave it visible, so scrolling
        // back up does not restart animations under the reader.
        if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
      },
      { threshold: 0.35, rootMargin: '0px 0px -10% 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`${visible ? 'is-visible' : ''} relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden ${className}`}
    >
      {children}
    </section>
  );
}

function SceneArt({ scene }: { scene: SceneDef }) {
  return (
    // Two nested layers on purpose. The reveal (`scene-rise`) and the ambient
    // effect (`scene-flicker` / `scene-pulse`) are both `animation` shorthands;
    // on one element the second rule silently wins and the reveal never runs,
    // leaving the art stuck at opacity 0. Splitting them gives each its own
    // element and its own animation slot.
    <div className="scene-layer absolute inset-0">
      <div className={`absolute inset-0 ${scene.effect ?? ''}`}>
        <Image
          src={scene.src}
          alt={scene.alt}
          fill
          priority={false}
          className="pixelated object-cover"
          sizes="100vw"
        />
      </div>
      {/* Readability scrim. The art is busy and the caption sits on top of it. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/35" />
    </div>
  );
}

function SceneCaption({ scene }: { scene: SceneDef }) {
  return (
    <div className="scene-layer relative z-10 mx-auto max-w-xl px-6 text-center" data-delay="2">
      <p className="font-pixel text-[0.55rem] uppercase tracking-widest text-green-300">
        {scene.reference}
      </p>
      <h2 className="mt-4 font-serif text-3xl font-bold text-white drop-shadow-lg sm:text-4xl">
        {scene.heading}
      </h2>
      <p className="mt-4 font-serif text-base leading-relaxed text-white/90 drop-shadow sm:text-lg">
        {scene.body}
      </p>
    </div>
  );
}

export default function PixelStory() {
  // null = not yet determined (pre-hydration). Rendering nothing in that state
  // avoids a hydration mismatch between server HTML and the localStorage check.
  const [seen, setSeen] = useState<boolean | null>(null);
  const finaleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) === '1');
    } catch {
      // Private browsing or storage disabled — treat as a first visit. Showing
      // the story twice is a far better failure than crashing the homepage.
      setSeen(false);
    }
  }, []);

  // Mark as seen once the reader actually reaches the resolution, not on mount.
  // Someone who bounces from the teaser should still get the story next time.
  useEffect(() => {
    const el = finaleRef.current;
    if (!el || seen !== false || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* non-fatal */ }
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen]);

  function replay() {
    try { window.localStorage.removeItem(SEEN_KEY); } catch { /* non-fatal */ }
    setSeen(false);
  }

  if (seen === null) return null;

  // Returning visitor: a single quiet line, not the whole sequence.
  if (seen) {
    return (
      <div className="border-y border-rule bg-green-50 py-6 text-center font-sans text-sm text-ink-soft">
        <button onClick={replay} className="underline decoration-green-300 underline-offset-4 hover:text-green-700">
          Replay the story behind the name
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1424]">
      {/* ---------------- TEASER: Scene 4 cold open ---------------------------
          Leads with the most emblematic beat. The line lands before the reader
          knows the story, and the cue invites them down into it. */}
      <Scene className="border-y-8 border-green-700">
        <div className="scene-layer absolute inset-0">
          <Image
            src="/scenes/scene-4-whisper.svg"
            alt="Pixel art: Elijah stands at a cave entrance under a starry sky, his face covered by his cloak. Faint silhouettes of a great crowd stand in the glow behind him."
            fill
            priority
            className="pixelated object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1424] via-transparent to-[#0d1424]/60" />
        </div>
        <div className="scene-layer relative z-10 w-full" data-delay="1">
          <DialogueBox cue="How did we get here?">{WHISPER_LINE}</DialogueBox>
        </div>
      </Scene>

      {/* ---------------- FULL STORY, in order ------------------------------- */}
      {SCENES.map((scene) => (
        <Scene key={scene.id} className="border-b-8 border-green-700">
          <SceneArt scene={scene} />
          <SceneCaption scene={scene} />
        </Scene>
      ))}

      {/* ---------------- RESOLUTION: Scene 4 again -------------------------- */}
      <Scene className="border-b-8 border-green-700">
        <div className="scene-layer absolute inset-0">
          <Image
            src="/scenes/scene-4-whisper.svg"
            alt="Pixel art: Elijah at the cave entrance again, cloak over his face, with the silhouettes of seven thousand faithful standing in the light behind him."
            fill
            className="pixelated object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1424] via-black/25 to-[#0d1424]/50" />
        </div>

        <div ref={finaleRef} className="relative z-10 flex w-full flex-col items-center gap-8">
          <div className="scene-layer mx-auto max-w-xl px-6 text-center" data-delay="1">
            <p className="font-pixel text-[0.55rem] uppercase tracking-widest text-green-300">
              1 Kings 19
            </p>
            <h2 className="mt-4 font-serif text-3xl font-bold text-white drop-shadow-lg sm:text-4xl">
              A gentle whisper
            </h2>
            <p className="mt-4 font-serif text-base leading-relaxed text-white/90 drop-shadow sm:text-lg">
              After the wind, the earthquake and the fire came a low whisper. Elijah covered his
              face and said he was the only one left. He was wrong by seven thousand.
            </p>
          </div>
          <div className="scene-layer w-full" data-delay="3">
            <DialogueBox>{WHISPER_LINE}</DialogueBox>
          </div>
        </div>
      </Scene>

      {/* Return to the green/white identity immediately after the sequence, as
          the brief asks — the earth-toned scenes end here and do not bleed into
          the rest of the page. */}
      <div className="bg-green-700 py-10 text-center">
        <p className="mx-auto max-w-lg px-6 font-serif text-lg text-green-50">
          You are not the only one. Neither are they.
        </p>
      </div>
    </div>
  );
}
