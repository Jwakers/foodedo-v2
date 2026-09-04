#!/usr/bin/env python3
"""Regenerate the in-code standard catalogue snapshot from a Convex export.

Usage:
  python3 scripts/catalogue-import/generate_standard_catalogue.py \\
    --export-root "/path/to/Foodedo Backup Restore"
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT_IMAGES = REPO / "public" / "images" / "catalogue"
OUT_JSON = REPO / "src" / "lib" / "domain" / "standard-catalogue-data.json"

PROTEIN_MAP = {
    "chicken": "chicken",
    "turkey": "chicken",
    "beef": "beef",
    "pork": "pork",
    "lamb": "lamb",
    "fish": "fish",
    "seafood": "fish",
    "vegetarian": "meat-free",
}

PREFERRED_SLUGS = [
    "chicken-fajitas",
    "lemon-herb-grilled-chicken",
    "baked-chicken-and-rice-casserole",
    "mediterranean-chicken-bake",
    "thai-noodle-soup",
    "chicken-and-vegetable-stir-fry",
    "chicken-tacos-with-salsa",
    "chicken-teriyaki-stir-fry",
    "beef-stroganoff",
    "beef-kofta-with-couscous",
    "beef-and-broccoli-stir-fry",
    "pork-stir-fry-with-vegetables",
    "bbq-pulled-pork-sandwiches",
    "pork-tacos-with-salsa",
    "lamb-kofta-kebabs-with-tzatziki",
    "lamb-and-mint-pasta",
    "thai-fish-curry",
    "lemon-garlic-butter-prawns",
    "fish-pie",
    "oven-baked-cod-with-tomato-and-basil",
    "shrimp-fried-rice",
    "veggie-stuffed-sweet-potatoes",
    "vegetarian-chili",
    "mediterranean-chickpea-salad",
    "pasta-puttanesca-with-olives-and-capers",
    "mushroom-risotto",
    "thai-red-curry-with-tofu",
    "roasted-vegetable-and-hummus-wrap",
    "tofu-stir-fry-with-broccoli-and-peppers",
]


def bucket(primary_protein: str | None) -> str:
    return PROTEIN_MAP.get(primary_protein or "", "other")


def map_protein(row: dict) -> tuple[str, str]:
    primary = row.get("primaryProtein")
    if primary in PROTEIN_MAP:
        return PROTEIN_MAP[primary], "mapped"
    title = row["title"].lower()
    names = " ".join(i.get("name", "") for i in row.get("ingredients") or []).lower()
    blob = f"{title} {names}"
    if "tofu" in blob or "tempeh" in blob:
        return "meat-free", "heuristic-other"
    if "duck" in blob:
        return "chicken", "heuristic-other-duck-as-chicken"
    if "venison" in blob or "deer" in blob:
        return "beef", "heuristic-other-venison-as-beef"
    return "meat-free", "heuristic-other-fallback"


def format_amount(amount: object) -> str | None:
    if amount is None:
        return None
    if isinstance(amount, float) and amount.is_integer():
        return str(int(amount))
    if isinstance(amount, int):
        return str(amount)
    if isinstance(amount, float):
        return ("%s" % amount).rstrip("0").rstrip(".")
    return str(amount)


def find_storage_file(storage: Path, image_id: str) -> Path:
    matches = [
        path
        for path in storage.glob(f"{image_id}.*")
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    ]
    if not matches:
        raise FileNotFoundError(image_id)
    return matches[0]


def select_meals(system_rows: list[dict], count: int = 30) -> list[dict]:
    by_slug = {row["publicSlug"]: row for row in system_rows}
    selected: list[dict] = []
    for slug in PREFERRED_SLUGS:
        if slug in by_slug and len(selected) < count:
            selected.append(by_slug[slug])

    selected_ids = {row["_id"] for row in selected}
    by_category: dict[str, list[dict]] = defaultdict(list)
    for row in system_rows:
        by_category[bucket(row.get("primaryProtein"))].append(row)

    targets = {
        "chicken": 8,
        "beef": 4,
        "pork": 3,
        "lamb": 2,
        "fish": 5,
        "meat-free": 7,
        "other": 1,
    }
    counts: Counter[str] = Counter(bucket(row.get("primaryProtein")) for row in selected)
    for category, target in targets.items():
        for row in by_category[category]:
            if len(selected) >= count:
                break
            if row["_id"] in selected_ids or counts[category] >= target:
                continue
            selected.append(row)
            selected_ids.add(row["_id"])
            counts[category] += 1

    for row in system_rows:
        if len(selected) >= count:
            break
        if row["_id"] not in selected_ids:
            selected.append(row)
            selected_ids.add(row["_id"])

    return selected[:count]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-root", type=Path, required=True)
    parser.add_argument("--count", type=int, default=30)
    args = parser.parse_args()

    recipes_path = args.export_root / "recipes" / "documents.jsonl"
    storage = args.export_root / "_storage"
    rows = [
        json.loads(line)
        for line in recipes_path.read_text().splitlines()
        if line.strip()
    ]
    system_rows = [row for row in rows if row.get("source") == "system"]
    selected = select_meals(system_rows, args.count)

    OUT_IMAGES.mkdir(parents=True, exist_ok=True)
    for path in OUT_IMAGES.iterdir():
        if path.is_file():
            path.unlink()

    meals = []
    review = []
    for row in selected:
        slug = row["publicSlug"]
        protein, how = map_protein(row)
        if how != "mapped" or row.get("primaryProtein") in ("turkey", "seafood", "other"):
            review.append(
                {
                    "slug": slug,
                    "title": row["title"],
                    "primaryProtein": row.get("primaryProtein"),
                    "proteinCategory": protein,
                    "mapping": how,
                }
            )

        source_image = find_storage_file(storage, row["image"])
        extension = source_image.suffix.lower()
        if extension == ".jpeg":
            extension = ".jpg"
        destination_name = f"{slug}{extension}"
        shutil.copy2(source_image, OUT_IMAGES / destination_name)

        ingredients = []
        for ingredient in row["ingredients"]:
            line = {"id": ingredient["id"], "name": ingredient["name"]}
            quantity = format_amount(ingredient.get("amount"))
            if quantity is not None:
                line["quantity"] = quantity
            if ingredient.get("unit"):
                line["unit"] = str(ingredient["unit"])
            if ingredient.get("preparation"):
                line["note"] = ingredient["preparation"]
            ingredients.append(line)

        steps = []
        for index, step in enumerate(row["method"], start=1):
            title = (step.get("title") or "").strip()
            description = (step.get("description") or "").strip()
            text = f"{title}: {description}" if title and description else description or title
            steps.append({"id": f"step-{index}", "text": text})

        meal = {
            "id": slug,
            "slug": slug,
            "title": row["title"],
            "description": row.get("description"),
            "servings": int(row["serves"]) if row.get("serves") is not None else None,
            "prepMinutes": int(row["prepTime"]) if row.get("prepTime") is not None else None,
            "cookMinutes": int(row["cookTime"]) if row.get("cookTime") is not None else None,
            "proteinCategory": protein,
            "imageSrc": f"/images/catalogue/{destination_name}",
            "ingredients": ingredients,
            "steps": steps,
        }
        meals.append({key: value for key, value in meal.items() if value is not None})

    OUT_JSON.write_text(json.dumps({"version": 2, "meals": meals}, indent=2) + "\n")
    print(f"Wrote {len(meals)} meals to {OUT_JSON}")
    print(f"Copied {len(list(OUT_IMAGES.iterdir()))} images to {OUT_IMAGES}")
    print(Counter(meal["proteinCategory"] for meal in meals))
    if review:
        print("Protein review:")
        for item in review:
            print(f"  {item}")


if __name__ == "__main__":
    main()
