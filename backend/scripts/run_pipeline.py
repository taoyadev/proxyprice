#!/usr/bin/env python3
"""
Run the full data pipeline: parse CSV -> normalize -> write frontend JSON.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    project_root = Path(__file__).parent.parent.parent
    parse_csv = project_root / "backend" / "scripts" / "parse_csv.py"
    normalize = project_root / "backend" / "scripts" / "normalize.py"

    subprocess.run([sys.executable, str(parse_csv)], check=True)
    subprocess.run([sys.executable, str(normalize)], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

