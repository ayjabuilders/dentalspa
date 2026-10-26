# Generated assets

All three assets were generated using the built-in ImageGen tool and copied into `dist/assets/`. No CLI fallback was used. The original supplied screenshot was used as a visual design reference; it was not embedded as the interface.

## Proportional assets for the desktop PWA

`prepare-assets.mjs` extracts each original 512×512 atlas cell into a separate lossless WebP: `patients`, `clinical`, `smile`, `lab`, `operations`, `business`, and `portrait-0` through `portrait-5`. Extraction preserves the original pixels; no photography was regenerated. Source atlases remain for provenance and are excluded from the offline cache.

Decorative photographs use proportional cover sizing, clinical previews and the comparison use contain sizing, and portraits use square frames. Both comparison layers share the same source and geometry. The hero uses a responsive cover crop without stretching. The same script renders 192px/512px PNG and maskable icons from the existing tooth identity with safe inset margins.

## Bundled typography

Manrope variable (200–800) and DM Sans variable (100–1000) are served locally and included in the PWA cache. Original binaries and their SIL Open Font License texts were downloaded from the official Google Fonts repository: `https://github.com/google/fonts/tree/main/ofl/manrope` and `https://github.com/google/fonts/tree/main/ofl/dmsans`. License files are retained beside the fonts. No font requests are made to Google at runtime.

## `dist/assets/hero.png`

Final prompt:

> Use case: ads-marketing. Asset type: wide 1536x1024 photographic website hero background for a premium French dental clinic dashboard. Create a luxurious, cinematic dental spa scene in midnight navy, cool blue and warm champagne gold, high-end photography. Composition: left 45 percent dark soft out-of-focus navy negative space; center a large luminous translucent blue glass holographic molar tooth with delicate gold orbital light trails; right side a beautiful smiling female dentist aged around 35 with dark hair tied back wearing a white medical coat, looking left toward the tooth, cropped shoulders and head. Modern premium dental clinic in softly blurred background with a curved warm glowing ceiling lamp at far right. The dentist occupies the rightmost third. Realistic skin, subtle volumetric light, elegant refined lighting. No text, no interface, no logos, no borders, no watermark. This will sit behind live dashboard headings so keep the left half very dark and calm.

## `dist/assets/workspaces.png`

Final prompt:

> Create a seamless premium dental photography moodboard texture atlas, 1536x1024 landscape, EXACTLY 3 columns and 2 rows of equal-size square photographs, each cell 512x512, no gutters or margins, no text or icons or graphic interfaces. Top-left: close up beautiful smiling dark-haired woman patient reclined in dental chair, cool luminous blue clinic mood. Top-center: male dentist in protective glasses, blue surgical mask and white coat working with precise dental tools, cool cyan light. Top-right: macro beautiful healthy white smiling teeth and lips with elegant soft pink-purple lighting. Bottom-left: 3D photoreal porcelain dental bridge and crown models suspended against dark indigo laboratory background, subtle blue grid lighting. Bottom-center: empty high-end dental clinic with a modern sage green dental chair and windows, muted emerald lighting. Bottom-right: luxury warm beige spa waiting room, gold pendant lamp, natural dried flowers in a glass vase, calm polished amber beige palette. Photographic, premium professional editorial quality. Every photo edge meets its neighboring image exactly, six clean rectangular image regions in a precise 3 by 2 grid. No text.

## `dist/assets/avatars.png`

Final prompt:

> Use case: photorealistic-natural. Asset type: profile avatar texture atlas for a premium dental software demo. Create a precisely aligned 3 columns by 2 rows grid, six equal square headshot portrait photographs, no margins, no gutters. 1536x1024 total. Each headshot has face centered and visible complete head, shoulders visible at bottom, warm neutral light beige studio background, soft natural lighting, realistic natural skin. Top-left: North African woman about 30 with shoulder length dark brown hair, friendly smile, beige top. Top-middle: North African man about 35 with short dark hair and neat short beard, friendly smile, pale blue shirt. Top-right: North African woman about 40 with long wavy brown hair, subtle friendly smile, cream blouse. Bottom-left: North African man about 30 with short black hair and trimmed beard, white shirt. Bottom-middle: North African woman about 35, dark hair tied back, white dentist coat, friendly professional smile. Bottom-right: North African woman about 27 with dark wavy hair, terracotta top, friendly smile. All six portraits framed the same, eye level, each head centered with generous background around hair to allow circular cropping. No text, no logos, no panels or borders.
