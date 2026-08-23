// SOMEWHERE — every decision that is a NUMBER or a WORD.
//
// Website 04 of the design section. This file is the one place to change what
// the world is made of and what it says: the palette the whole diorama is
// painted from, where the four destinations sit on the sphere, how far the
// camera stands back from each of them, and the handful of lines of copy.
//
// The rule that makes this worth having: nothing below imports three. These
// are plain numbers and strings, so the world can be recoloured, rescaled or
// rewritten without opening a file that knows what a mesh is.

/* ══ PALETTE ═══════════════════════════════════════════════════════════════
   Read off 4-MasterWorld.png and 4-StyleSheet.png rather than invented. The
   discipline here is that there are no blues in the LAND ramp and no greens in
   the WATER ramp — the reference gets its warmth from keeping those two
   families completely separate and letting the cliff line be the only place
   they meet. Every colour is a warm-side version of itself: the grass is
   yellow-green rather than blue-green, the rock is brown-grey rather than
   neutral, and the snow is cream rather than white. */
export const PAL = {
  // Land. Four steps from the sunlit top of a hill to the shadow under a hedge.
  grass:      0x6f9639,
  grassLit:   0x8fb04a,
  grassDeep:  0x4c6d2a,
  moss:       0x3d5c22,

  // The paths and the beaches — the same warm sand at two brightnesses.
  sand:       0xc4a570,
  sandDeep:   0xa4834f,

  // Rock. The mountain, the cliffs, the scatter of stones. Brown-grey, never
  // blue-grey: a cold rock next to this grass reads as concrete.
  rock:       0x8b8177,
  rockDeep:   0x6b6259,
  rockLit:    0xa89c8f,

  // Snow and cloud. Cream and off-white — a pure white cap would punch a hole
  // in the middle of the composition.
  snow:       0xf4efe3,
  cloud:      0xf6f2ea,

  // Water. Only ever these three, and all of them sit on the blue side.
  sea:        0x2a6690,
  seaDeep:    0x143f61,
  seaFoam:    0xdfeef5,
  river:      0x3d8ab8,

  // Wood, in the two roles the style sheet uses it for: structure and trim.
  wood:       0x8a5f38,
  woodDark:   0x5f3f24,
  woodLight:  0xb08a5c,

  // Roofs. The village gets its life from these four and nothing else.
  roofRed:    0xa8412f,
  roofBlue:   0x3f6a8c,
  roofGreen:  0x4e6f45,
  roofSlate:  0x51606b,

  // Walls — the warm plaster every building in the reference is built from.
  plaster:    0xd8bb87,
  plasterDim: 0xb2946a,

  // The light inside the windows, and the lamps. One warm amber, used sparingly.
  lamp:       0xffc266,
  lampCore:   0xffe4b0,

  // The character. Burlap and its stitching.
  cloth:      0x9a6f45,
  clothDark:  0x6d4c2c,

  // The accents the style sheet scatters everywhere: buttons, flowers, berries.
  button:     0xd9a441,
  flowerRed:  0xc4483c,
  flowerPink: 0xd47f96,
  flowerBlue: 0x4f7fb5,
  mushroom:   0xbe4436,

  // The lighthouse, the one saturated red in the world.
  stripe:     0xb63f34,
};

/* ══ SKY ═══════════════════════════════════════════════════════════════════
   Two different skies, because the references use two. The landing is the deep
   desaturated teal of 4-Landing.png — the world is lit but the room it hangs in
   is not — and the destinations open out into the brighter daylight blue of
   4-Coast.png. Moving between them is most of why arriving somewhere feels
   like arriving. */
export const SKY = {
  landing:  { top: 0x0e2a38, bottom: 0x1d4557, fog: 0x16374a },
  day:      { top: 0x2f6f96, bottom: 0x76a8c4, fog: 0x86b3cc },
  dusk:     { top: 0x14283f, bottom: 0x2e4a63, fog: 0x27405a },
};

/* ══ SCALE ═════════════════════════════════════════════════════════════════
   One number the whole world is built from. The planet's land shell sits at
   R, the ocean a little inside it, and every prop is sized as a fraction of R
   so the diorama can be rescaled without re-tuning ninety magic numbers. */
export const R = 10;

export const WORLD = {
  radius: R,
  ocean: R * 0.965,        // the waterline, just under the cliff lip
  landCap: 0.66,           // how much of the sphere is land, 0..1 from the pole
  spin: 0.02,              // idle rotation, radians/second — barely a drift
};

/* ══ CAMERA ════════════════════════════════════════════════════════════════
   Distances are in world units, so they read against R = 10 above. The landing
   stands well back because the composition in 4-Landing.png is mostly sky. */
export const CAM = {
  fov: 34,

  /* ══ THE LANDING FRAME ═══════════════════════════════════════════════════
     4-Landing.png is mostly SKY. The planet is a small object floating in a
     large room, occupying maybe half the frame height with generous air above
     and below it, and that composition is the whole first impression: a tiny
     world you could pick up. At R * 4.15 the planet filled four fifths of the
     viewport and read as a giant low-poly island seen from a hilltop.

     At this distance the sphere spans a bit over half the viewport height, and
     the whole silhouette is visible with nothing cropped. */
  landing: { dist: R * 5.7, yaw: 0.66, pitch: 0.58, pan: -0.40 },

  near: 0.1,
  far: 400,

  /* ══ DRAG PHYSICS ════════════════════════════════════════════════════════
     Four numbers, and between them they make the world feel like a small
     handcrafted globe rather than a spinning coin.

     The failure they exist to prevent: raw pointer deltas are unbounded. One
     fast flick on a trackpad is several hundred pixels in a single frame, and
     converting that straight into angular velocity let the planet reach speeds
     nobody could read. Sensitivity alone cannot fix it — halving the gain just
     means you flick twice as hard. It needs an actual ceiling. */

  // Radians of yaw per pixel of drag. The comfortable band is 0.003–0.006.
  sensitivity: 0.0034,

  // The most any SINGLE frame's pointer movement may contribute, in pixels.
  // Stops one violent sample dominating everything around it.
  maxDragStep: 70,

  /* How far, in radians, the world may fall BEHIND the hand. This is the
     ceiling that actually bounds a flick: the velocity cap limits how fast the
     world coasts, but nothing else limits how much rotation a gesture can queue
     up in front of it. About twenty degrees of lag — enough that the motion
     still feels weighted, small enough that releasing mid-flick never unleashes
     a spin nobody asked for. */
  maxLag: 0.36,

  // THE HARD CEILING, in radians per second. About a quarter turn per second —
  // fast enough to whip the world round, slow enough to always read.
  maxSpin: 1.7,

  // The fraction of spin KEPT after one second of coasting. Low on purpose:
  // a flick should carry briefly and settle, not freewheel.
  inertia: 0.020,

  // How quickly the camera catches its target, per 60Hz frame.
  damp: 0.14,

  // The idle drift, in radians per second — barely a breath.
  spin: 0.018,

  flyDuration: 1750,       // ms, world → destination
  backDuration: 1400,      // ms, destination → world

  /* ══ LOOKING AROUND, ONCE ARRIVED ════════════════════════════════════════
     A place holds the camera at a fixed EYE — the flight already decided
     where you are standing — but nothing says which way you face once you
     get there. This is that: yaw and pitch of the view direction only, the
     position never moves. Slightly gentler than the globe's drag, because
     turning your head is a smaller gesture than spinning a planet. */
  lookSensitivity: 0.0026,
  lookPitchLimit: 1.40,    // radians either side of level — just short of straight up/down
};

/* ══ THE FOUR DESTINATIONS ═════════════════════════════════════════════════
   `lat`/`lon` place a landmark on the sphere in degrees — latitude up from the
   equator, longitude around it. Everything else about a destination is derived
   from that one position: where its geometry is built, where its label floats,
   and where the camera stops when you click it.

   THE DESTINATION ANCHOR. Five numbers, all authored in the surface frame at
   the landmark — the ground's own normal and two tangents across it — rather
   than in raw world coordinates, because "come in from the south-east, four
   units back and two up" is a sentence somebody can reason about and a vector
   is not:

     approach  the compass bearing the camera arrives FROM, in degrees. This is
               what stops every destination being entered from the same side,
               and it is chosen per place: the coast is approached from the sea
               so the lighthouse is against the water, the mountain from below
               so it rises in front of you.
     distance  how far back along that bearing the camera stops, in units of R.
     height    how far up the surface normal it stops. Together with `distance`
               this sets the angle you look down at — roughly 25 to 35 degrees
               is the diorama range.
     lookUp    how far above the ground the aim point sits, so the horizon
               falls in the lower half of the frame and there is sky over the
               place.
     lookPast  how far BEYOND the anchor the camera aims, which pushes the
               landmark off dead centre. A thing in the exact middle of frame
               reads as a specimen being photographed; a thing slightly off it
               reads as somewhere you are standing.

   THE LAT/LON PAIRS ARE NOT FREEHAND. The coastline is generated, so a position
   that sounds right can easily be fifty metres out to sea — three of these four
   originally were, and the props stood on open water. Each one was found by
   searching the sphere for the point nearest the intended spot that is on dry
   land, is flat enough to build on, and sits in the altitude band that
   destination wants. Move one by hand and check `heightAt` still says land. */
export const DESTINATIONS = [
  {
    id: 'mountain',
    no: '01',
    name: 'MOUNTAIN',
    lat: 62, lon: -15,
    approach: 195, distance: 0.40, height: 0.13, lookUp: 0.012, lookPast: 0.020,
    facts: [['HEIGHT', '2,840m'], ['TRAILS', '06']],
    line: 'Snow that never melts, and a path that keeps going up.',
    sky: 'day',
  },
  {
    id: 'village',
    no: '02',
    name: 'VILLAGE',
    lat: 22, lon: 42,
    approach: 20, distance: 0.44, height: 0.20, lookUp: 0.030, lookPast: 0.02,
    facts: [['HOUSES', '11'], ['CLOCK', '5:40']],
    line: 'Where everybody ends up, eventually, at about six.',
    sky: 'dusk',
  },
  {
    id: 'coast',
    no: '03',
    name: 'COAST',
    lat: 28, lon: 102,
    /* APPROACHED FROM THE WATER, which is the one composition that works here.

       4-Coast.png is a three-quarter aerial taken from out at sea: water across
       the foreground, the harbour and lighthouse in the middle, land rising
       behind. Standing on the land and looking out cannot reproduce it — on a
       ten-unit planet the horizon from a few units up is only about six units
       away, so there is no distance for a seascape to happen in and the shot
       comes back as sky over a strip of grass.

       Putting the camera over the water instead makes the sea the FOREGROUND,
       which needs no horizon at all. */
    /* AIMED AT THE HARBOUR, NOT AT THE ANCHOR. `lookPast` is negative here and
       nowhere else in the world, and that sign is the whole framing: positive
       pushes the aim point AWAY from the camera and further inland, which is
       right for a place you are looking into, and it left the coast staring at
       a hillside of trees with the pier sliding off the bottom of frame. The
       harbour is built about two and a half units SEAWARD of the anchor — the
       one direction a positive value can never reach — so the aim has to come
       back towards the camera to find it.

       `approach` is the bay's true seaward bearing, measured off the same
       (out, along) frame world.js lays the harbour out in, so the camera
       arrives down the axis the pier is built along. */
    approach: 200, distance: 1.05, height: 0.50, lookUp: 0.05, lookPast: -0.22,
    facts: [['DEPTH', '40m'], ['BOATS', '03']],
    line: 'A light that turns all night for nobody in particular.',
    sky: 'day',
  },
  {
    id: 'forest',
    no: '04',
    name: 'FOREST',
    lat: 42, lon: -105,
    approach: 95, distance: 0.42, height: 0.17, lookUp: 0.028, lookPast: 0.02,
    facts: [['TREES', '340'], ['QUIET', 'YES']],
    line: 'Deeper in than it looks from the outside.',
    sky: 'day',
  },
];

/* ══ COPY ══════════════════════════════════════════════════════════════════
   All of it. The landing is four short lines because 4-Landing.png is four
   short lines — the planet is the argument and the type just has to get out of
   its way. */
export const COPY = {
  title: 'SOMEWHERE',
  welcome: 'WELCOME TO SOMEWHERE.',
  sub: 'A WORLD WORTH EXPLORING.',
  cta: 'EXPLORE WORLD',
  drag: 'DRAG TO EXPLORE',
  back: 'BACK TO WORLD',
  explore: 'EXPLORE',
};

/* The loading sequence. Four things get built, in the order a person would
   build them, and the list is short enough that it is over before it becomes
   a loading screen. */
export const BUILDING = ['TERRAIN', 'TREES', 'VILLAGE', 'WATER'];
