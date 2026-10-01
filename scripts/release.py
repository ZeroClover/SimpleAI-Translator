import argparse
from pathlib import Path
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description='Publish a release using reviewed, user-facing notes.')
    parser.add_argument('version', help='Release version, for example 1.3.0')
    parser.add_argument('notes', type=Path, help='UTF-8 Markdown file with one change per bullet')
    args = parser.parse_args()

    if not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        parser.error('version must use X.Y.Z format')

    notes = args.notes.read_text(encoding='utf-8').strip()
    lines = [line for line in notes.splitlines() if line.strip()]
    if not lines or any(not re.fullmatch(r'- \S.*', line) for line in lines):
        parser.error('notes must contain only nonempty Markdown bullets, one change per line; omit the version heading')

    if subprocess.check_output(['git', 'status', '--porcelain']).strip():
        parser.error('commit the release changes and notes before publishing')

    tag = f'v{args.version}'
    subprocess.run(['git', 'tag', '-a', tag, '-F', '-'], input=notes + '\n', text=True, check=True)
    subprocess.run(['git', 'push', 'origin', tag], check=True)


if __name__ == '__main__':
    main()
