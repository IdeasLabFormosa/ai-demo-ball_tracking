# Trajectory · Ball Tracking

A buildless, pure frontend explorer for the saved results in `data/`. It uses the Playground 2 layout: result history on the left, video and trajectory layers in the center, one small ROI crop, and a video navigator on the right. The desktop workspace fits the viewport; only history and video lists scroll internally. On narrow screens, the ROI sits beneath the video within the same bounded workspace.

## Run

```sh
node scripts/serve.mjs
```

Open http://localhost:8000. If that port is occupied, use `node scripts/serve.mjs --port=8123` and open http://localhost:8123. Node 22, FFmpeg, and ffprobe are required for source video preparation. No npm installation, inference service, or runtime API is needed. The local server supports byte-range requests for video seeking.

Every launch automatically checks the source videos and results, creates or repairs optimized MP4s and thumbnails, updates the manifest and size report, removes obsolete generated copies, and rebuilds `dist/` before serving. Unchanged videos are reused using SHA-256 source and output checksums stored in the ignored `.cache/` folder. Replacing a video under the same filename is detected automatically. The first launch on a machine prepares every source once.

While the server runs, it watches `data/videos/` and `data/results/`. Adding, replacing, or deleting a video, changing a tag, or adding/removing results automatically runs preparation and rebuilding again. The local browser reloads after a successful update. Watcher errors are printed in the terminal; fix the data and edit it again to retry. Generated files do not retrigger the watcher. On a clean clone without `data/videos/`, committed playback videos can be previewed and saved results/tags refreshed without FFmpeg; an existing but empty source folder deliberately produces an empty catalog.

## Explore

Choose a result history and video. Newly added history folders appear first; their discovery order is saved in the generated manifest so editing tags/results does not reorder the list. The hamburger button slides the history panel closed and expands the workspace; Escape also closes it. On narrow screens the panel starts closed, and opening it temporarily hides the video rail to preserve space, matching the template. Search or filter the video list by the labels supplied in that history’s `tag.json`. Labels are read-only.

Toggle raw output, fitting curve, and extrapolation with the right-side legend buttons. Click the ROI card to select it and show its actual ROI bounds and points on the main video; click again to deselect. There is no ROI legend entry. Each color swatch opens the template-style palette and hex picker. SVG plots use fixed screen-sized dots, current-frame contours, translucent paths, series-wide hover highlighting, coordinate tooltips, click selection, and double-click seeking. Paths reveal through the current frame, matching the template. The ROI card uses the template’s square default size, calculated as `(viewport height − 46 px) / 4` on desktop. Double-click to toggle 1.8× enlargement; enlargement selects the card and highlights its border. Its raster and SVG points share the same viewport transform. Center, detected, and output markers use cyan/amber/green rings with fixed screen radii of 6/9/12 px and hover highlighting, matching the template’s detail marker style. The center marker comes from the saved ROI center; output comes from `output_xy`. Geometry stays in original image coordinates even though the playback copies are smaller. Frames without saved ROI geometry show an empty card. No inference button or invalid-tail layer is included.

The playback bar floats inside the video and appears on hover, interaction, or keyboard focus. It uses the template’s play/stop icons and an impact tag positioned on the timeline. No metadata or helper text is displayed below it.

Space plays or stops; left/right or comma/period step frames; Home/End jump to the ends; Shift+left jumps to the nearest earlier impact or frame zero; Shift+right jumps to the last frame; I jumps to impact; Shift+up/down changes videos. The timeline also seeks directly. Playback shortcuts are captured before focused buttons, legend toggles, or sliders can activate, and held Space does not repeatedly toggle playback. Typing fields and open dialogs retain their normal editing keys. Browser/system shortcuts with Ctrl, Command, or Alt are preserved.

Both windows support wheel/pinch zoom, drag panning, and plus/minus/zero keys when focused. Zoom stays within 1–32×. Pan bounds are recalculated from the fitted image, viewport, and zoom to prevent dragging past the image edges. Double-clicking the main video background resets its view. Main-video image, plots, selected ROI geometry, and fixed-size markers stay aligned at all zoom levels.

Frame requests are queued with one active seek and the latest pending request. Image, plots, and ROI publish together after the decoder presents the matching frame. Rapid scrubbing/held arrow keys coalesce pending work. Playback uses video presentation timestamps; switching videos cancels older loads and seeks. Playback stops when the page loses focus or becomes hidden.

## Data and video preparation

All displayed footage, thumbnails, labels, and trajectories originate in `data/`. The UI reads the generated `data/manifest.json`, `data/web/` playback copies and thumbnails, and `data/results/<history>/results/<video>/output.json`. The selected video’s heatmap archive is loaded once and decoded in the browser using native ZIP/zlib decompression. The provided moving-detector maps are 32 × 32 uint8 arrays. Heatmaps use the template’s JET palette, a 0.05 threshold, and alpha 89/255. Frames without a saved map show their crop without a heatmap. Both the source image and heatmap are clipped to the actual ROI and video bounds; the rest of the full model-input window stays black. Completed heatmaps publish only if they still match the presented frame.

Original videos in `data/videos/` are retained locally and ignored by Git. Commit `data/web/`, `data/manifest.json`, and `data/results/` with the application. This keeps the original 109 MiB clip out of Git and avoids shipping the roughly 390 MiB original collection.

Normally, just add/remove clips in `data/videos/` and run `node scripts/serve.mjs`. Match result folders to the source filename without its extension: `data/results/<history>/results/<video-stem>/output.json`. Different sources must have distinct stems. Videos without a result still appear and play, with a message explaining the missing trajectory. Missing `tag.json` files default to unlabeled. Deleted source videos disappear from the catalog and deployment; original result archives are preserved locally.

For preparation without starting the server:

```sh
node scripts/prepare.mjs --build
```

Changes are detected automatically. To explicitly re-encode every source with the current settings:

```sh
node scripts/prepare.mjs --rebuild
```

Videos are H.264/yuv420p MP4, capped at 960 pixels on the longest edge, without audio, with `faststart` metadata. All decodable source frames are retained in order. Timestamps are normalized to the source average frame rate to match the saved frame-indexed results; high-frame-rate videos are not reduced to 30 fps. Some original containers have inaccurate nominal frame counts, so the catalog uses counted decoded frames. Frame stepping in browsers uses timestamp seeking rather than a scientific decoder.

Only the selected video is loaded; other list items use small lazy-loaded JPEG thumbnails. History changes reuse the current video. Videos use metadata preload and the server supports range requests.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys pushes to `main` or `master`, and can be run manually. In the repository’s **Settings → Pages → Build and deployment**, select **GitHub Actions**. Commit and push this project to trigger deployment.

```sh
node scripts/build.mjs
```

Startup also builds this directory automatically. The build contains only the static UI, manifest, and currently referenced result files, thumbnails, and optimized videos; it excludes orphaned results and removed videos. All asset URLs are relative, so a GitHub Pages repository subpath works. The build does not require FFmpeg or original videos once the generated assets are committed.

After the terminal reports “Data ready” and “Static site ready”, the tracked generated files are ready for your usual Git commit and push. Nothing is committed or pushed automatically. If a refresh fails, fix the error before committing.

See `VIDEO_REPORT.md` for automatically updated media sizes. Run `node --test tests/*.test.mjs` to check incremental preparation, replacements, deletion cleanup, asset repair, empty libraries, and deployment filtering (requires FFmpeg and ffprobe).
