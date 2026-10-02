"""Safely deliver printable text to a headless Android preview guest."""

import shlex


async def send_adb_text(value, *, adb, device, run_checked):
    # The adb client runs `shell` arguments through Android's command parser.
    # Quote each remote argument so punctuation in a user's login cannot turn
    # into shell syntax. Android's `input text` treats "%s" as a space, so
    # send literal percent signs in separate calls to preserve strings like
    # "%s" exactly.
    pieces = value.split("%")
    for index, piece in enumerate(pieces):
        if index:
            await run_checked(adb, "-s", device, "shell", "input text '%'", timeout=10)
        if piece:
            await run_checked(adb, "-s", device, "shell", "input text " + shlex.quote(piece.replace(" ", "%s")), timeout=10)
