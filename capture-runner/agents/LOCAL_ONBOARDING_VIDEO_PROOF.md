# Local onboarding motion proof

This is an opt-in MacBook experiment. It records real Android motion around
the onboarding agent's planned taps, swipes, Back actions, and app launch.
Adjacent actions share a short burst; idle planning time is not recorded.
The normal capture runner and Northstar product do not read or publish these files.

## Before starting

Install/confirm `adb`, `ffmpeg`, `ffprobe`, `tesseract`, and the Python dependencies already
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

For a local proof of an app's guest first-run journey, add
`--local-video-guest-path`. This is opt-in for the local video experiment; it
lets the agent finish at a usable guest home without creating an account.
Give any factual onboarding answers through a clearly marked synthetic test
profile if no real identity is intended.

Configure `OPENAI_API_KEY`, `ONBOARDING_EMAIL`, `ONBOARDING_PASSWORD`, and an
identity profile if the chosen app needs them, exactly as for an ordinary local
onboarding run. The agent creates `data/onboarding_<app>_<date>/` by default.
The proof adds `local_video_bursts/` and `local_video_bursts.jsonl` there.
`--local-video-bursts` is never passed by the production supervisor.

The recorder skips external verification and discards a burst if another app
has focus at its end. Planned text entry stays in the motion recording so the
agent's real typing time is preserved. A grounded input row is mandatory;
the editor covers that row in the finished film before its privacy check.
Raw bursts can contain personal details displayed *inside* the app. Keep this
experiment on a synthetic test account and do not upload or publish raw files.

## Automatic edit and render

After a completed local run, the agent automatically selects the forward
journey, skips launch footage when the first app action is available, removes
paired exploratory scrolls, repeated unchanged actions, ungrounded credential
steps, external verification, and placeholder-only clips. Static holds and loading gaps
are trimmed within the selected bursts. It then renders the film and validates
its format, duration, final Home frame, and sampled frames for visible account
identifiers or verification-code entry. It writes `onboarding_local_proof.mp4`,
`onboarding_local_proof_sources.json`, and `onboarding_local_proof_qa.json` in
the session. Incomplete or uncertain runs fail closed without a finished film.
The QA file records the taps and typed-input events that actually made the cut.

To rerun the automatic editor on a saved completed session:

```sh
/opt/anaconda3/bin/python3 local_onboarding_video.py auto data/onboarding_<app>_<date>
```

The source manifest traces each shot back to its original burst. The editor
rejects duplicate or reordered clips and normalizes to 720 × 1280 at 30 fps.
The local proof remains separate from Northstar production until the automated
quality bar has been demonstrated on more than one onboarding flow.
