#!/usr/bin/env python3
"""Verify the deployment bundle against this checkout without reading configuration/secrets."""
import argparse
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--infra-root', type=Path, default=Path.home() / 'projects/projects')
args = parser.parse_args()
source = Path(__file__).resolve().parents[1] / 'db/changelog'
target = args.infra_root / 'stacks/steeple/db/changelog'
fixtures = {'002-seed.sql', '012-room-photo-curation.sql', '018-local-media-paths.sql'}

def manifest(directory):
    return re.findall(r'^\s+file:\s+(\S+)', (directory / 'db.changelog-master.yaml').read_text(), re.M)

expected = [name for name in manifest(source) if name not in fixtures]
actual = manifest(target)
assert actual == expected, f'Deploy migration order differs:\nexpected {expected}\nactual {actual}'
for name in expected:
    local = (source / name).read_text()
    deployed = (target / name).read_text()
    if name == '010-require-price.sql':
        # The original deployment deliberately omitted local seed repricing. Never
        # replace an applied production changelog or invent prices for real listings.
        local = re.sub(r'--changeset steeple:010-reprice-free-rooms.*?(?=--changeset)', '', local, flags=re.S)
    def executable(text):
        return '\n'.join(line.strip() for line in text.splitlines()
                         if line.strip() and (not line.lstrip().startswith('--')
                                              or line.lstrip().startswith('--changeset')))
    assert executable(local) == executable(deployed), f'Migration SQL/directives differ: {name}'
print(f'PASS: {len(expected)} deployment migrations match; fixture files and 010 seed repricing remain excluded')
