import {useEffect, useState} from 'react';
import {continueRender, delayRender, getStaticFiles, staticFile} from 'remotion';

// Every capture-dependent coordinate lives here, in logical CSS px of the 1440x1100 capture viewport
// (2x DPR files use the same numbers). Defaults are hand-measured with AssetInspect; a capture sidecar JSON can
// override them with a "regions" object (see VIDEO_RENDER_NOTES.md), so recaptures need no code change.
export type Rect = {x: number; y: number; w: number; h: number};
export type CropSpec = {x: number; w: number};

export type Regions = {
  sourceCrop: CropSpec; // original site A horizontal crop
  flectoCrop: CropSpec; // FLECTO B horizontal crop
  sourceField: Rect; // A's first field group (label + input + hint)
  flectoField: Rect; // B's first field group
  reviewValues: Rect[]; // B review value text boxes; underline drawn under each (empty = no underlines)
  sourceZoom: number; // push-in factor on A's field before it lifts out
};

// Benefits story, measured 15:17 KST from the A/B V2 recapture.
export const BENEFITS_REGIONS: Regions = {
  sourceCrop: {x: 0, w: 1440},
  flectoCrop: {x: 120, w: 1200},
  sourceField: {x: 300, y: 542, w: 404, h: 66},
  flectoField: {x: 349, y: 348, w: 742, h: 252},
  reviewValues: [
    {x: 349, y: 466, w: 274, h: 32},
    {x: 349, y: 599, w: 180, h: 32},
    {x: 349, y: 732, w: 52, h: 32},
    {x: 349, y: 865, w: 79, h: 32},
  ],
  sourceZoom: 2.2,
};

// Insurance story (11–16 captures). Re-measured on arrival; see notes.
// Measured 15:48 KST on 11–16: A/B field geometry matches V2; B crop widened so the real 도우미 callouts
// (x up to ~1410) stay in frame.
export const INSURANCE_REGIONS: Regions = {
  ...BENEFITS_REGIONS,
  flectoCrop: {x: 120, w: 1300},
  reviewValues: [
    {x: 349, y: 466, w: 208, h: 32},
    {x: 349, y: 599, w: 78, h: 32},
    {x: 349, y: 732, w: 202, h: 32},
    {x: 349, y: 865, w: 180, h: 32},
  ],
};

type Sidecar = {regions?: {crop?: CropSpec; field?: Rect; values?: Rect[]; zoom?: number}};

export const mergeRegions = (base: Regions, a: Sidecar | null, b: Sidecar | null, review: Sidecar | null): Regions => ({
  ...base,
  sourceCrop: a?.regions?.crop ?? base.sourceCrop,
  sourceField: a?.regions?.field ?? base.sourceField,
  sourceZoom: a?.regions?.zoom ?? base.sourceZoom,
  flectoCrop: b?.regions?.crop ?? base.flectoCrop,
  flectoField: b?.regions?.field ?? base.flectoField,
  reviewValues: review?.regions?.values ?? base.reviewValues,
});

export const useRegions = (base: Regions, names: {source: string; input: string; review: string}): Regions => {
  const [regions, setRegions] = useState(base);
  const [handle] = useState(() => delayRender('capture regions'));
  useEffect(() => {
    const files = new Set(getStaticFiles().map((f) => f.name));
    const load = (n: string): Promise<Sidecar | null> =>
      files.has('assets/' + n + '.json')
        ? fetch(staticFile('assets/' + n + '.json'))
            .then((r) => r.json() as Promise<Sidecar>)
            .catch(() => null)
        : Promise.resolve(null);
    Promise.all([load(names.source), load(names.input), load(names.review)]).then(([a, b, c]) => {
      setRegions(mergeRegions(base, a, b, c));
      continueRender(handle);
    });
  }, [handle, base, names.source, names.input, names.review]);
  return regions;
};
