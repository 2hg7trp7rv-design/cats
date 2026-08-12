#!/usr/bin/env python3
"""Apply the reviewed Cat's tower V0.2 payload to the repository root."""
from __future__ import annotations

import base64
import io
import tarfile
from pathlib import Path

EXPECTED = [
    'README.md',
    'app.js',
    'styles.css',
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'tests/mobile-smoke.mjs',
    'tests/battle-smoke.mjs',
    'tests/recovery-smoke.mjs',
]


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parts_dir = root / 'scripts' / 'v02_payload_parts'
    parts = sorted(parts_dir.glob('part*.txt'))
    if not parts:
        raise RuntimeError('V0.2 payload parts are missing')
    raw = base64.b64decode(''.join(part.read_text().strip() for part in parts))
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if names != EXPECTED:
            raise RuntimeError(f'Unexpected payload contents: {names!r}')
        for member in members:
            target = (root / member.name).resolve()
            if root.resolve() not in target.parents:
                raise RuntimeError(f'Unsafe path in payload: {member.name}')
        archive.extractall(root, filter='data')
    print("Applied Cat's tower V0.2 payload")


if __name__ == '__main__':
    main()
