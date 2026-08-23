// KIT — the props that were modelled in Blender rather than written in JS.
//
// `assets/website4/somewhere-kit.glb` holds the hero assets: the character, the
// cottage, the two trees, and the rest of the built world. They live there
// rather than in props.js because the thing that sells "handmade" is a soft
// beveled silhouette — bevel, then subdivision, then a noise displacement — and
// that is a modelling operation. Reproducing it from three's primitives means
// hand-rolling a bevel solver, which is a lot of code to arrive somewhere worse.
//
// THE CONTRACT IS THE SAME ONE props.js USES. A builder returns an array of
// { geo, mat }, and `scatter()` turns that into one InstancedMesh per part. So
// a Blender prop and a JS prop are interchangeable everywhere in the world:
// nothing downstream knows or cares which file a tree came from. That is the
// whole reason the split is safe.
//
// WHY THE PARTS ARE SPLIT BY MATERIAL. Each prop is exported as several meshes
// — `TREE_wood`, `TREE_leaf`, `TREE_berry` — rather than one. It has to be:
// an InstancedMesh carries exactly one material, so a single-mesh tree would
// force either a texture atlas or three hundred separate draws. Split by
// material, three hundred trees are three draws.
//
// EVERY PROP IS PRE-NORMALISED. The Blender side centres each prop on x/y and
// stands it on z = 0 before export, so a prop's origin is on its own feet and
// placing one is just "put the origin on the ground".

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const KIT_URL = '../../assets/website4/somewhere-kit.glb';

/* The prefixes the Blender export uses, and what each one is for. Adding a prop
   is a line here plus a builder over there — nothing else in the world changes. */
export const PROPS = {
  // Scattered in the hundreds — these are the ones whose triangle count
  // actually multiplies, so they are kept lean.
  tree: 'TREE',
  conifer: 'CONI',
  rock: 'ROCK',
  character: 'CHAR',
  house: 'HOUS',

  // One-offs and near-one-offs. A landmark can afford geometry a tree cannot,
  // because there is exactly one of it.
  lighthouse: 'LITE',
  clocktower: 'CLOK',
  cabin: 'CABN',
  stall: 'STAL',
  locomotive: 'LOCO',
  carriage: 'CARR',
  sailboat: 'BOAT',
};

let loaded = null;

/* Load once. Returns a map of prefix → kit, where a kit is the same
   [{ geo, mat }] array the JS builders produce.

   `url` is resolved against this module rather than the page, because the
   design section is served from the site root but this file is three
   directories down, and a relative asset path that works in one is wrong in
   the other. */
export function loadKit(url = KIT_URL) {
  if (loaded) return loaded;

  const href = new URL(url, import.meta.url).href;

  loaded = new Promise((resolve, reject) => {
    new GLTFLoader().load(
      href,
      (gltf) => resolve(harvest(gltf.scene)),
      undefined,
      (e) => reject(new Error(`SOMEWHERE: could not load the world kit — ${e?.message ?? e}`)),
    );
  });
  return loaded;
}

/* Walk the loaded scene and sort every mesh into a kit by its name prefix.
   The transform is baked into the geometry on the way past: the export puts
   each prop at the origin, but a mesh can still carry a parent's rotation from
   the Y-up conversion, and an InstancedMesh ignores whatever transform the
   source mesh had. Baking it now means the instance matrices are the only
   transform in play. */
function harvest(root) {
  const kits = {};

  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh) return;

    const prefix = node.name.slice(0, 4).toUpperCase();
    const key = Object.keys(PROPS).find((k) => PROPS[k] === prefix);
    if (!key) return;

    const geo = node.geometry.clone();
    geo.applyMatrix4(node.matrixWorld);
    geo.computeVertexNormals();

    (kits[key] ??= []).push({ geo, mat: convert(node.material), name: node.name });
  });

  // A stable order, so `kits.tree[0]` is the same part on every load. Blender's
  // export order follows selection order, which is not a promise.
  Object.values(kits).forEach((parts) => parts.sort((a, b) => a.name.localeCompare(b.name)));
  return kits;
}

/* Blender's Principled BSDF comes through as MeshStandardMaterial, which is
   already the right class — but with defaults this world does not want. Three
   fixes, and they are the same three rules craft.js is built on:

     roughness up   nothing in this world is glossy
     metalness off  nothing in this world is metal
     emissive kept  the window lights are the one exception, and they have to
                    survive or every building goes dark at dusk */
function convert(src) {
  const mat = src.clone();
  mat.metalness = 0;
  mat.roughness = Math.max(mat.roughness ?? 1, 0.82);
  mat.flatShading = false;

  // An emissive material is a light source, not a surface: it must not be
  // dimmed by tone mapping or it stops reading as a lit window at dusk.
  if (mat.emissiveIntensity > 0 && mat.emissive && !mat.emissive.equals(new THREE.Color(0, 0, 0))) {
    mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 1.6);
    mat.toneMapped = false;
  }
  return mat;
}

/* Release everything the kit holds. The design section keeps three other worlds
   alive, so leaving a megabyte of geometry attached to a world nobody is
   looking at is not acceptable. */
export function disposeKit() {
  if (!loaded) return;
  loaded.then((kits) => {
    Object.values(kits).forEach((parts) => parts.forEach(({ geo, mat }) => {
      geo.dispose();
      mat.dispose();
    }));
  }).catch(() => {});
  loaded = null;
}
