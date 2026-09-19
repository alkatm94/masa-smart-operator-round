from pathlib import Path
import argparse

def validate(path: Path, classes: int = 13) -> list[str]:
    errors = []
    for label in path.rglob("*.txt"):
        for number, line in enumerate(label.read_text(encoding="utf-8").splitlines(), 1):
            parts = line.split()
            try:
                values = [float(part) for part in parts]
                if len(values) != 5 or int(values[0]) != values[0] or not 0 <= values[0] < classes or any(not 0 <= value <= 1 for value in values[1:]):
                    raise ValueError
            except ValueError:
                errors.append(f"{label}:{number}: invalid YOLO label: {line}")
    return errors

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("path", nargs="?", default="datasets/masa-industrial/labels")
    errors = validate(Path(parser.parse_args().path))
    print("\n".join(errors) if errors else "Labels valid")
    raise SystemExit(bool(errors))

if __name__ == "__main__": main()
