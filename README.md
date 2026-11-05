# Trajectory · Ball Tracking

A buildless, pure frontend explorer for the saved results in `data/`. It uses the Playground 2 layout: result history on the left, video and trajectory layers in the center, one small ROI crop, and a video navigator on the right. Layout stacks on narrow screens.

## Run

```sh
node scripts/serve.mjs
```

Open http://localhost:8000. Node 22 is recommended. No npm installation, inference service, or runtime API is needed. The local server supports byte-range requests for video seeking.

## Explore

Choose a result history and video. Search or filter the video list by the labels supplied in that history’s `tag.json`. Labels are read-only.

Toggle raw output, fitting curve, extrapolation, and ROI. Paths reveal through the current frame, matching the template. The ROI card shows the saved model window, the ROI rectangle, and the detected point. Geometry stays in original image coordinates even though the playback copies are smaller. Frames without saved ROI geometry show an empty card. No inference button or invalid-tail layer is included.

Space plays or pauses; left/right step frames; Home/End jump to the ends; I jumps to impact; Shift+up/down changes videos. The frame slider and numeric input also seek directly.

## Data and video preparation

All displayed footage, thumbnails, labels, and trajectories originate in `data/`. The UI reads the generated `data/manifest.json`, `data/web/` playback copies and thumbnails, and `data/results/<history>/results/<video>/output.json`. Result heatmap archives are preserved in deployment but are not decoded by this ROI crop viewer.

Original videos in `data/videos/` are retained locally and ignored by Git. Commit `data/web/`, `data/manifest.json`, and `data/results/` with the application. This keeps the original 109 MiB clip out of Git and avoids shipping the roughly 390 MiB original collection.

After changing the data, regenerate the catalog (requires FFmpeg and ffprobe):

```sh
node scripts/prepare.mjs
```

To regenerate existing playback copies after replacing a source:

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

This produces `dist/` containing only the static UI, manifest, result files, and optimized videos. All asset URLs are relative, so a GitHub Pages repository subpath works. The build does not require FFmpeg or original videos once the generated assets are committed.

See `VIDEO_REPORT.md` for measured media sizes and verification.
