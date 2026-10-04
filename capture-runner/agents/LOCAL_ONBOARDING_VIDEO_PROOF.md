# Local onboarding motion proof

This is an opt-in MacBook experiment. It records real Android motion around
the onboarding agent's planned taps, swipes, Back actions, and app launch.
Adjacent actions share a short burst; idle planning time is not recorded.
The normal capture runner and Northstar product do not read or publish these files.

## Before starting

Install/confirm `adb`, `ffmpeg`, `ffprobe`, and the Python dependencies already
needed by `onboarding_mobile2.py`. On this Mac, `/opt/anaconda3/bin/python3`
has the agent's OpenAI, Pillow, NumPy, and OpenCV dependencies; the Homebrew
`python3` currently does not have OpenAI installed. Start one emulator, install the chosen app,
and confirm that `adb devices -l` lists it as `device`. Use a test account and
keep its credentials in your shell environment, not in the command line or Git.
Only one Android `screenrecord` may run on that emulator during this proof.

## Capture

From this directory, run the existing onboarding agent with one added flag:

```sh
ANDROID_SERIAL=emulator-5554 /opt/anaconda3/bin/python3 onboarding_mobile2.py \
  --app-name 'Chosen App' --package 'com.example.app' --local-video-bursts
```

Configure `OPENAI_API_KEY`, `ONBOARDING_EMAIL`, `ONBOARDING_PASSWORD`, and an
identity profile if the chosen app needs them, exactly as for an ordinary local
onboarding run. The agent creates `data/onboarding_<app>_<date>/` by default.
The proof adds `local_video_bursts/` and `local_video_bursts.jsonl` there.
`--local-video-bursts` is never passed by the production supervisor.

The recorder skips external verification and text-entry commands, and discards
a burst if another app has focus at its end. A burst can still contain personal
details displayed *inside* the app. Review every clip before selecting it; do
not upload or publish raw proof files.

## Edit and render

Create a review plan after the run:

```sh
python3 local_onboarding_video.py plan data/onboarding_<app>_<date>
```

Open the clips and `local_video_edit_plan.json`. Each candidate starts with
`include: false`. Choose one chronological journey: select only the distinct
steps that show a clear action and result; trim dead time with `trim_in` and
`trim_out` in seconds. Omit retries, duplicate screens, account secrets, Gmail,
and transitions outside the app. Then set `reviewed: true` and render:

```sh
python3 local_onboarding_video.py render data/onboarding_<app>_<date>
```

This writes `onboarding_local_proof.mp4` and
`onboarding_local_proof_sources.json`. The latter traces every shot back to
its raw burst. The renderer rejects duplicate or reordered clips and refuses
unreviewed plans. It normalizes all clips to 720 × 1280 at 30 fps. This is a
first editorial cut for local assessment; it does not claim that a coherent or
beautiful sequence can be guaranteed without inspecting the real footage.

Once we choose the app and run it, we can judge the capture quality, edit the
journey, and improve the pacing and presentation before integrating anything
into the product.
