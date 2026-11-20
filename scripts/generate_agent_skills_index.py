#!/usr/bin/env python3
"""
Generate /.well-known/agent-skills/index.json (Agent Skills Discovery RFC v0.2.0)
from SKILL.md files in docs/.well-known/agent-skills/<name>/SKILL.md.
"""
from pathlib import Path
import argparse, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'docs'
SKILLS_DIR = WEB / '.well-known' / 'agent-skills'
SCHEMA_URI = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
DEFAULT_DOMAIN = 'https://nibbanagamini.org'
NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def parse_frontmatter(text: str, path: Path) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != '---':
        raise ValueError(f'Missing YAML frontmatter start in {path}')
    end_idx = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == '---':
            end_idx = idx
            break
    if end_idx is None:
        raise ValueError(f'Unterminated YAML frontmatter in {path}')

    meta: dict[str, str] = {}
    for line in lines[1:end_idx]:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if ':' not in line:
            raise ValueError(f'Unsupported frontmatter line in {path}: {line!r}')
        key, val = line.split(':', 1)
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        meta[key.strip()] = val
    return meta


def build_index(base_url: str = DEFAULT_DOMAIN) -> dict:
    base = base_url.rstrip('/')
    skills = []
    for skill_file in sorted(SKILLS_DIR.glob('*/SKILL.md')):
        raw_bytes = skill_file.read_bytes()
        meta = parse_frontmatter(raw_bytes.decode('utf-8'), skill_file)
        name = meta.get('name', '').strip()
        description = meta.get('description', '').strip()
        folder_name = skill_file.parent.name

        if name != folder_name:
            raise ValueError(f'Skill name {name!r} does not match directory {folder_name!r}')
        if not (1 <= len(name) <= 64) or not NAME_RE.match(name):
            raise ValueError(f'Invalid skill name per RFC v0.2.0: {name!r}')
        if not (1 <= len(description) <= 1024):
            raise ValueError(f'Invalid skill description length for {name!r}: {len(description)}')

        digest = hashlib.sha256(raw_bytes).hexdigest()
        skills.append({
            'name': name,
            'type': 'skill-md',
            'description': description,
            'url': f'{base}/.well-known/agent-skills/{name}/SKILL.md',
            'digest': f'sha256:{digest}',
        })

    if not skills:
        raise ValueError(f'No SKILL.md files found under {SKILLS_DIR}')

    return {
        '$schema': SCHEMA_URI,
        'skills': skills,
    }


def main():
    parser = argparse.ArgumentParser(description='Generate /.well-known/agent-skills/index.json')
    parser.add_argument('--base-url', default=DEFAULT_DOMAIN, help=f'Base canonical URL (default: {DEFAULT_DOMAIN})')
    parser.add_argument('--output', default=str(SKILLS_DIR / 'index.json'), help='Output index.json path')
    args = parser.parse_args()

    index_obj = build_index(args.base_url)
    out_path = Path(args.output)
    out_path.write_text(json.dumps(index_obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Generated agent skills index at {out_path} ({len(index_obj['skills'])} skills)")


if __name__ == '__main__':
    main()
