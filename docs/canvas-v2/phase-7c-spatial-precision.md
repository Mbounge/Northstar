# Canvas V2 Phase 7C — Spatial precision

Phase 7C converts the model's creative direction into explicit spatial intent
and gives each observed turn factual geometry from the real render.

## Factual observation

The isolated renderer now records a bounded map of every visible stable node:

- node and nearest stable-parent identity;
- exact rendered bounds;
- client and scroll dimensions;
- structural computed styles such as display, position, grid columns, gap,
  alignment, typography, white space, and overflow;
- non-nested bounding-box intersections and content-box overflow identities.

These are measurements, not quality judgments. An intersection can be an
intentional overlay, relationship, or annotation. The model sees the complete
screenshot, source, and measurements together and decides what they mean.

## Model-owned spatial strategy

Every research, edit, and completion decision carries the model's current:

- artboard growth direction;
- layout system and primary anchor;
- hierarchy and scale logic;
- spacing rhythm;
- relationship logic;
- current spatial adjustment;
- declared intentional overlaps.

The runtime stores that strategy between exact render observations but never
translates it into layout. The model remains the only source author.

## North Star craft

The artboard grammar now emphasizes alignment rails, content-driven geometry,
semantic peer scaling, natural image aspect ratios, readable source-unit
typography, anchored relationships, deliberate negative space, and refinement
against the actual downscaled complete-artboard render.

No fixed composition, mandatory section, objective sequence, aesthetic score,
or runtime repair policy was added.
