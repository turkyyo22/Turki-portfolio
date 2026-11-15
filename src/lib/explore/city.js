// The fixed plan of the 3D city: its streets, the places where project
// buildings stand, which post goes where, and the route the tour drives through
// them. Pure data and functions with no three.js: the server builds the tour
// with it, the engine builds the city from it, and the tests check it.
//
// Coordinates are metres on the ground. The main street runs along z with -z
// ahead; +x is to the right of a visitor driving down it.
//
// Every post keeps its place: a place is a fixed spot on the map, so adding a
// post fills a free place without moving the others. The owner can also pin a
// post to a place in the admin dashboard (post.explore.place).

import { localizePost } from "@/lib/content/normalize";

import { balloonReach, createRoute, driveBalloon } from "./path";
import { signWords, stopKind, stopTheme } from "./plan";

const HALF_PI = Math.PI / 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

// --- Streets -----------------------------------------------------------------

// Half of each kind of road's width, and its sidewalk's width, in metres.
export const STREETS = {
  main: { half: 7, walk: 5 },
  avenue: { half: 7, walk: 5 },
  side: { half: 5, walk: 3.5 },
  alley: { half: 2.2, walk: 0 },
};

/** How far from a street's centre line its buildings' facades stand. */
export const facadeOf = (kind) => STREETS[kind].half + STREETS[kind].walk + 0.6;

export const MAIN_STREET = { fromZ: 130, toZ: -850 };
export const TOUR_START_Z = 70;
export const GATE_Z = 36;
export const TURN_RADIUS = 9;
export const END_PLAZA = { z: -800, radius: 28 };
// The route ends at the plaza's edge, where the camera rises to look across it.
export const FINALE_Z = END_PLAZA.z + END_PLAZA.radius + 6;
const CENTRE_Z = -340;

export const JUNCTIONS = [
  { id: "j1", z: -110 },
  { id: "j2", z: CENTRE_Z },
  { id: "j3", z: -540 },
];

// The streets that leave the main street at each junction. `side` -1 is to the
// left, 1 to the right. `reach` is how far the centre of the square at its end
// lies from the main street's centre line. At a court or a square the route
// drives round a roundabout of radius `loop` (`neck` is the radius of the turns
// onto and off it); `square` is the radius of the paved square. A stub is a
// short dead end that the route never enters.
export const SIDE_STREETS = [
  { id: "j1-left", junction: "j1", side: -1, street: "side", end: "court", reach: 80, loop: 11, neck: 6, square: 19 },
  { id: "j1-right", junction: "j1", side: 1, street: "side", end: "stub", reach: 52 },
  { id: "j2-left", junction: "j2", side: -1, street: "avenue", end: "square", reach: 112, loop: 17, neck: 8, square: 30 },
  { id: "j2-right", junction: "j2", side: 1, street: "avenue", end: "square", reach: 112, loop: 17, neck: 8, square: 30 },
  { id: "j3-left", junction: "j3", side: -1, street: "side", end: "court", reach: 80, loop: 11, neck: 6, square: 19 },
  { id: "j3-right", junction: "j3", side: 1, street: "side", end: "court", reach: 80, loop: 11, neck: 6, square: 19 },
];

// Narrow alleys between the buildings of the main street: scenery that breaks up the street wall.
export const ALLEYS = [
  { z: -28, side: 1, length: 38 },
  { z: -52, side: -1, length: 34 },
  { z: -292, side: 1, length: 40 },
  { z: -482, side: -1, length: 36 },
  { z: -598, side: -1, length: 36 },
];

// Elevated railways crossing the main street, where trains pass between the buildings.
export const RAILS = [{ z: -300 }, { z: -470 }];

// The districts along the main street, from the gate onward. A side street
// belongs to the district of its junction.
export const DISTRICTS = [
  { id: "old", untilZ: -250 },
  { id: "mid", untilZ: -300 },
  { id: "centre", untilZ: -470 },
  { id: "new", untilZ: -715 },
  { id: "frontier", untilZ: -Infinity },
];

/** The district a point on the main street belongs to. */
export function districtAt(z) {
  return DISTRICTS.find((district) => z > district.untilZ)?.id ?? "frontier";
}

/** How grand the city is at a point on the main street: 0 at the gate, 1 at the centre, easing off toward the frontier. */
export function grandnessAt(z) {
  if (z >= CENTRE_Z) return clamp((TOUR_START_Z - z) / (TOUR_START_Z - CENTRE_Z), 0, 1) ** 2;
  return lerp(1, 0.5, clamp((CENTRE_Z - z) / (CENTRE_Z - END_PLAZA.z), 0, 1));
}

export const junctionById = (id) => JUNCTIONS.find((junction) => junction.id === id);
export const sideStreetById = (id) => SIDE_STREETS.find((street) => street.id === id);

// --- Places ------------------------------------------------------------------

// Where project buildings stand. "before" places hold projects older than the
// career milestones at the centre of the city, "after" places the newer ones.
// Within a group, places are filled in this order.
export const PLACES = [
  { id: "a1", group: "before", at: "j1-left", size: "small", type: "workshop" },
  { id: "a2", group: "before", at: "main", side: 1, z: -205, size: "medium", type: "studio" },
  { id: "a3", group: "before", at: "main", side: -1, z: -268, size: "small", type: "studio" },
  { id: "b1", group: "after", at: "main", side: -1, z: -430, size: "large", type: "tower" },
  { id: "b2", group: "after", at: "j3-right", size: "medium", type: "lab" },
  { id: "b3", group: "after", at: "main", side: 1, z: -625, size: "large", type: "tower" },
  { id: "b4", group: "after", at: "j3-left", size: "medium", type: "lab" },
  { id: "b5", group: "after", at: "main", side: -1, z: -690, size: "large", type: "tower" },
];

// The two career milestones, facing each other across the centre of the city.
export const LANDMARKS = [
  { id: "grad", kind: "graduation", at: "j2-left", size: "landmark", type: "academy" },
  { id: "coop", kind: "coop", at: "j2-right", size: "landmark", type: "bank" },
];

// Construction sites near the end of the street, for unfinished projects that have no post yet.
export const LOTS = [
  { id: "lot-1", side: 1, z: -704 },
  { id: "lot-2", side: -1, z: -736 },
  { id: "lot-3", side: 1, z: -742 },
];

// The kinds of building a project can be. The landmarks have their own.
export const BUILDING_TYPES = ["workshop", "studio", "lab", "tower"];

// Ground covered by a building: across its front, front to back, and how far
// steps or a porch reach out in front of it.
export const FOOTPRINTS = {
  small: { width: 14, depth: 12, apron: 0 },
  medium: { width: 18, depth: 14, apron: 0 },
  large: { width: 22, depth: 18, apron: 0 },
  academy: { width: 36, depth: 18, apron: 5.4 },
  bank: { width: 26, depth: 20, apron: 1 },
};

// Where the camera pauses for a building on the main street: this far before it, and this far across the street.
const VIEW_AHEAD = 34;
const VIEW_ACROSS = 3;

const ALL_PLACES = [...LANDMARKS, ...PLACES];
export const placeById = (id) => ALL_PLACES.find((place) => place.id === id);
const placeAtStreet = (streetId) => ALL_PLACES.find((place) => place.at === streetId);

/** The district of a place. */
export function districtOf(place) {
  if (place.at === "main") return districtAt(place.z);
  return districtAt(junctionById(sideStreetById(place.at).junction).z);
}

/** How grand a place's surroundings are (0 to 1). */
export function grandnessOf(place) {
  if (place.at === "main") return grandnessAt(place.z);
  return grandnessAt(junctionById(sideStreetById(place.at).junction).z);
}

/** The footprint of the building at a place: the size the post asks for, or the place's own. */
export function footprintOf(place, size) {
  if (place.size === "landmark") return FOOTPRINTS[place.type];
  return FOOTPRINTS[size] ?? FOOTPRINTS[place.size];
}

/** The corners of a footprint turned by `turn`, relative to its centre. */
export function cornersOf({ width, depth, apron }, turn) {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2 + apron],
    [-width / 2, depth / 2 + apron],
  ].map(([lx, lz]) => ({ x: lx * cos + lz * sin, z: -lx * sin + lz * cos }));
}

/**
 * Where the building at a place stands, which way it faces and where the camera
 * pauses to look at it. `turn` turns the building so that its front (its local
 * +z) faces (sin turn, cos turn). `view` is the camera's pause point.
 */
export function siteOf(place, footprint = footprintOf(place)) {
  if (place.at === "main") {
    // A building on the main street turns toward the point where the camera pauses,
    // and stands just far enough back that its nearest corner clears the sidewalk.
    const { side, z } = place;
    const view = { x: -side * VIEW_ACROSS, z: z + VIEW_AHEAD };
    const facade = facadeOf("main");
    let x = side * (facade + 1.4 + Math.hypot(footprint.width, footprint.depth) / 2);
    for (let pass = 0; pass < 6; pass += 1) {
      const turn = Math.atan2(view.x - x, view.z - z);
      const reach = Math.max(...cornersOf(footprint, turn).map((corner) => -side * corner.x));
      x = side * (facade + 1.3 + reach);
    }
    return { x, z, turn: Math.atan2(view.x - x, view.z - z), view, footprint };
  }

  // A building at the end of a side street faces back down it, across its square.
  // The camera pauses beside the roundabout's centre, a quarter of the way round
  // it, for a three-quarter view of the building (see driveBalloon in path.js).
  const street = sideStreetById(place.at);
  const { z } = junctionById(street.junction);
  const front = street.reach + street.square + 1.5;
  return {
    x: street.side * (front + footprint.apron + footprint.depth / 2),
    z,
    turn: street.side < 0 ? HALF_PI : -HALF_PI,
    view: { x: street.side * street.reach, z: z + street.side * street.loop },
    footprint,
  };
}

/** Where a construction lot stands. */
export function lotSite(lot) {
  const footprint = { width: 13, depth: 13, apron: 0 };
  return { x: lot.side * (facadeOf("main") + 2 + footprint.depth / 2), z: lot.z, turn: lot.side < 0 ? HALF_PI : -HALF_PI, footprint };
}

const byDate = (a, b) =>
  (a.date || "9999").localeCompare(b.date || "9999") ||
  (a.createdAt || "").localeCompare(b.createdAt || "") ||
  (a.slug || a.id || "").localeCompare(b.slug || b.id || "");

/**
 * Which post stands at which place: a Map from place id to post.
 * 1. The graduation project and the co-op take the two landmarks.
 * 2. A post pinned to a place in the dashboard takes it, if it is free.
 * 3. The rest go by date: projects older than the milestones fill the "before"
 *    places, newer ones the "after" places. When a group runs out of places, its
 *    posts take free places of the other group. Posts beyond the last free place
 *    are left out of the city.
 */
export function assignPlaces(posts = []) {
  const assigned = new Map();
  const remaining = [];
  for (const post of posts) {
    const landmark = LANDMARKS.find((item) => item.kind === stopKind(post));
    if (landmark && !assigned.has(landmark.id)) assigned.set(landmark.id, post);
    else remaining.push(post);
  }

  const automatic = [];
  for (const post of remaining) {
    const pinned = PLACES.find((place) => place.id === post.explore?.place);
    if (pinned && !assigned.has(pinned.id)) assigned.set(pinned.id, post);
    else automatic.push(post);
  }

  const free = (group) => PLACES.filter((place) => !assigned.has(place.id) && (!group || place.group === group));
  const fill = (list, group) => {
    for (const post of list) {
      const place = free(group)[0] ?? free()[0];
      if (place) assigned.set(place.id, post);
    }
  };

  const milestone = LANDMARKS.map((landmark) => assigned.get(landmark.id)?.date)
    .filter(Boolean)
    .sort()[0];
  const sorted = automatic.sort(byDate);
  if (!milestone) {
    fill(sorted);
  } else {
    fill(sorted.filter((post) => post.date && post.date < milestone), "before");
    fill(sorted.filter((post) => !(post.date && post.date < milestone)), "after");
  }
  return assigned;
}

// --- The route ---------------------------------------------------------------

const preference = (placeId) => ALL_PLACES.findIndex((place) => place.id === placeId);
const turnInto = (side) => (side < 0 ? HALF_PI : -HALF_PI);

/**
 * The route through the city for the places that hold a stop (`occupied`, a Set
 * of place ids), as a path (see path.js). It drives down the main street and
 * turns into a side street wherever one holds a stop, rounds the square at its
 * end and comes back. Each stop is marked on the path with its place id, and the
 * far point of each square with "<place id>:far". Returns the path and the
 * stops' place ids in the order the route reaches them.
 */
export function planRoute(occupied = new Set()) {
  const route = createRoute(0, TOUR_START_Z, 0, -1);
  const order = [];
  const stopAt = (placeId) => {
    route.mark(placeId);
    order.push(placeId);
  };
  // (A stop in a square is marked inside the drive round its roundabout.)

  const pending = PLACES.filter((place) => place.at === "main" && occupied.has(place.id))
    .map((place) => ({ id: place.id, viewZ: place.z + VIEW_AHEAD }))
    .sort((a, b) => b.viewZ - a.viewZ);
  const driveDownTo = (limitZ) => {
    while (pending.length > 0 && pending[0].viewZ > limitZ) {
      const next = pending.shift();
      route.forwardToZ(next.viewZ);
      stopAt(next.id);
    }
  };

  for (const junction of JUNCTIONS) {
    driveDownTo(junction.z + TURN_RADIUS);
    const visits = SIDE_STREETS.filter((street) => street.junction === junction.id && street.end !== "stub")
      .map((street) => ({ street, placeId: placeAtStreet(street.id)?.id }))
      .filter((visit) => visit.placeId && occupied.has(visit.placeId))
      .sort((a, b) => preference(a.placeId) - preference(b.placeId));

    if (visits.length === 0) {
      route.forwardToZ(junction.z - TURN_RADIUS);
      continue;
    }
    route.forwardToZ(junction.z + TURN_RADIUS);
    visits.forEach(({ street, placeId }, index) => {
      // The second street lies straight across the main street from the first.
      if (index === 0) route.turn(TURN_RADIUS, turnInto(street.side));
      route.forwardToX(street.side * (street.reach - balloonReach(street.loop, street.neck)));
      order.push(placeId);
      driveBalloon(route, { loopRadius: street.loop, neckRadius: street.neck, sideMark: placeId, farMark: `${placeId}:far` });
      if (index === visits.length - 1) {
        route.forwardToX(street.side * TURN_RADIUS);
        route.turn(TURN_RADIUS, turnInto(street.side));
      }
    });
  }

  driveDownTo(-Infinity);
  route.forwardToZ(FINALE_Z);
  route.mark("finale");
  return { path: route.build(), order };
}

// --- The tour ----------------------------------------------------------------

/**
 * Plans the city for the published content: which post stands where, the stops
 * in the order the route reaches them, the construction lots and the street
 * signs. Plain data, sent from the server to the browser.
 */
export function buildCity({ posts = [], menu = [], skills = [], lang = "en" } = {}) {
  const assigned = assignPlaces(posts);
  const { order } = planRoute(new Set(assigned.keys()));
  const progressBySlug = new Map(menu.filter((item) => item.slug).map((item) => [item.slug, item.progress]));

  const stops = order.map((placeId) => {
    const place = placeById(placeId);
    const post = assigned.get(placeId);
    const { title, description, content } = localizePost(post, lang);
    const kind = place.kind ?? "project";
    const progress = progressBySlug.has(post.slug) ? progressBySlug.get(post.slug) : null;
    const explore = post.explore ?? {};
    return {
      id: post.id || post.slug || placeId,
      slug: post.slug,
      place: placeId,
      kind,
      type: place.size === "landmark" ? place.type : BUILDING_TYPES.includes(explore.type) ? explore.type : place.type,
      size: place.size === "landmark" ? place.type : explore.size || place.size,
      district: districtOf(place),
      grandness: grandnessOf(place),
      // Which side of the street the building stands on: 1 right, -1 left, 0 straight ahead.
      side: place.at === "main" ? place.side : 0,
      theme: stopTheme(post, kind),
      title,
      description,
      content,
      tags: post.tags ?? [],
      date: post.date,
      year: (post.date || "").slice(0, 4),
      imageUrl: post.imageUrl,
      githubUrl: post.githubUrl,
      liveUrl: post.liveUrl,
      progress,
      inProgress: progress !== null && progress < 100,
      accent: explore.accent || "",
      lines: explore.lines?.[lang] ?? null,
    };
  });

  // Unfinished projects that have no post yet stand as construction sites near the end.
  const published = new Set(posts.map((post) => post.slug).filter(Boolean));
  const upcoming = menu
    .filter((item) => item.progress < 100 && !(item.slug && published.has(item.slug)))
    .map((item) => ({ id: item.id, name: (lang === "ar" ? item.arName : item.enName) || item.enName || item.arName, progress: item.progress }))
    .filter((item) => item.name)
    .slice(0, LOTS.length);

  return { stops, upcoming, signs: signWords(skills) };
}
