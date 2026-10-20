/** Neutral, self-contained retained PNGs for DEV editing/lifecycle fixtures.
 * Deterministic raster geometry; no account artwork or local export files. */
export const FIXTURE_PHOTO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAABF0lEQVR42u3ZvQ2CUBSAUZZyGht7FzFxIkcwti7iBFpYmBgkeB/vD07y9Zd7QsNluNzuKtCAADRogQYNmgJo0Kvt+biOBjo78VLcoOcqJ1qD/kM5xXqgHAg06BUpx6xBgwYNGjRo0KBBg2YN2peho5IzqTOpw/8Wuf3K8nNWoEGDFmjQAg0atECDFmjQoAUatECXhj6eT+FSBm9tLmjQoEGDbhh6tz+8A51p7pv3A/0V6PDcUc+f0HPcQU/IBqED7/uKC4gFobfmnk60DPT63Bc3yQLdo3tuhBLQbboX3roCdC33umvWh87n3tRezUGnuLe8SOvQ0+4dPXln0P0GGjRogQYNGgFo0AINGjQF0KAFGjRoCiV6AXy3YDcLr7RoAAAAAElFTkSuQmCC';
export const FIXTURE_LOGO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAYCAIAAAC+8q7fAAAAV0lEQVR42u3ZsQkAIAxFQZdyGhvHt7WwdwZF1MDBq1Nc9SFp9KYLJQSgQesgdC51NZovoTfuRA80aNCgQYMWaNCgQYMGHXt1gAYNGjRo0FaHDwtogf6mCdz2WEOH9kpNAAAAAElFTkSuQmCC';
export const FIXTURE_REPLACEMENT_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAoklEQVR42u3QwQkAEAAAQNsqP5lGdrCJdbyt4CVxdRNcyKm+ao52jyBatGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atOj96B4LB4gWLRrRokUrEC0a0aJFWxAtGtGiRVsQLRrRokUjWjSiRYtGtGhEi/7ZAr/r3WhjdFIaAAAAAElFTkSuQmCC';
export const FIXTURE_IMAGE_ASSETS = [
  { id: 'contract-photo', url: FIXTURE_PHOTO_DATA_URL, label: 'Neutral landscape fixture', mediaType: 'image' as const, mimeType: 'image/png' },
  { id: 'contract-logo', url: FIXTURE_LOGO_DATA_URL, label: 'Neutral geometric fixture logo', mediaType: 'image' as const, mimeType: 'image/png' },
];
