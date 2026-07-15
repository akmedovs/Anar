#!/usr/bin/env python3
import json
import os
import shlex
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def fail(message, code=1):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def clean_plate(raw):
    return normalize_plate_candidate(raw)


def normalize_plate_candidate(raw):
    value = re.sub(r"[^A-Z0-9-]", "", (raw or "").upper().replace(" ", ""))
    if not value:
        return ""

    translated = value.translate(str.maketrans({
        'O': '0',
        'Q': '0',
        'D': '0',
        'I': '1',
        'L': '1',
        'Z': '2',
        'S': '5',
        'B': '8',
        'G': '6',
        'T': '7',
    }))

    patterns = [
        re.compile(r'(\d{2}[A-Z]{2}\d{3})'),
        re.compile(r'(\d{1,2}[A-Z]{1,3}\d{2,4})'),
        re.compile(r'([A-Z0-9-]{6,10})'),
    ]

    for candidate in (translated, value):
        for pattern in patterns:
            match = pattern.search(candidate)
            if match:
                return match.group(1)

    return translated or value


def preprocess_for_ocr(image):
    try:
        import cv2
    except Exception:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return gray


def build_ocr_variants(image):
    try:
        import cv2
    except Exception:
        return [image]

    variants = []
    base = image

    if base is None:
        return variants

    enlarged = cv2.resize(base, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    variants.append(enlarged)

    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY) if len(enlarged.shape) == 3 else enlarged
    variants.append(gray)

    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(thresh)
    variants.append(cv2.bitwise_not(thresh))

    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    variants.append(adaptive)
    variants.append(cv2.bitwise_not(adaptive))

    sharpen_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    sharpened = cv2.filter2D(gray, -1, sharpen_kernel)
    variants.append(sharpened)

    return variants


def plate_score(candidate):
    if not candidate:
        return 0

    score = len(candidate)
    if re.fullmatch(r'\d{2}[A-Z]{2}\d{3}', candidate):
        score += 100
    elif re.fullmatch(r'\d{1,2}[A-Z]{1,3}\d{2,4}', candidate):
        score += 60
    elif re.fullmatch(r'[A-Z0-9-]{6,10}', candidate):
        score += 20

    if any(ch.isdigit() for ch in candidate):
        score += 5
    if any(ch.isalpha() for ch in candidate):
        score += 5

    return score


def run_tesseract_ocr(image_path, config):
    command = ['tesseract', str(image_path), 'stdout']
    if config:
        command.extend(shlex.split(config))

    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError(
            "tesseract tapilmadi. OCR ucun tesseract qurasdirin, meselen: brew install tesseract"
        )

    if completed.returncode not in (0, 1):
        stderr = (completed.stderr or completed.stdout or '').strip()
        raise RuntimeError(stderr or f'tesseract exited with code {completed.returncode}')

    return completed.stdout or ''


def get_ocr_configs():
    default = os.environ.get(
        "VEHICLE_OCR_CONFIG",
        "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    )
    configs = [
        default,
        "--psm 8 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        "--psm 13 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    ]

    seen = set()
    unique = []
    for config in configs:
        normalized = " ".join(shlex.split(config))
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)

    return unique


def run_multi_pass_ocr(image_path, image, cv2_module):
    candidates = []
    temp_paths = []

    try:
        if cv2_module is not None and image is not None:
            variants = build_ocr_variants(image)
            for index, variant in enumerate(variants):
                suffix = f'.ocr-{index}.png'
                temp_path = image_path.with_suffix(suffix)
                temp_paths.append(temp_path)
                cv2_module.imwrite(str(temp_path), variant)
                for config in get_ocr_configs():
                    text = run_tesseract_ocr(temp_path, config)
                    plate = clean_plate(text)
                    if plate:
                        candidates.append((plate_score(plate), plate, text.strip(), config))
        else:
            for config in get_ocr_configs():
                text = run_tesseract_ocr(image_path, config)
                plate = clean_plate(text)
                if plate:
                    candidates.append((plate_score(plate), plate, text.strip(), config))
    finally:
        for temp_path in temp_paths:
            if temp_path.exists():
                temp_path.unlink()

    if not candidates:
        return None

    candidates.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    best_score, best_plate, best_text, best_config = candidates[0]
    return {
        "plate": best_plate,
        "text": best_text,
        "score": best_score,
        "config": best_config,
        "candidates": [
            {"plate": plate, "text": text, "score": score, "config": config}
            for score, plate, text, config in candidates[:5]
        ],
    }


def main():
    try:
        if len(sys.argv) < 2:
            return fail("Image path is required.", 2)

        image_path = Path(sys.argv[1])
        if not image_path.exists():
            return fail(f"Image not found: {image_path}", 2)

        cv2 = None
        try:
            import cv2 as cv2_module

            cv2 = cv2_module
        except Exception:
            cv2 = None

        image = None
        if cv2 is not None:
            image = cv2.imread(str(image_path))
            if image is None:
                return fail(f"Unable to read image: {image_path}")

        bbox = None
        score = None
        crop = image
        mode = "ocr-only"

        model_path = os.environ.get("VEHICLE_YOLO_MODEL", "").strip()
        if model_path:
            try:
                from ultralytics import YOLO

                model_file = Path(model_path)
                if model_file.exists():
                    model = YOLO(str(model_file))
                    conf = float(os.environ.get("VEHICLE_YOLO_CONF", "0.25"))
                    results = model.predict(source=image if image is not None else str(image_path), verbose=False, conf=conf)

                    if results and results[0].boxes is not None and len(results[0].boxes) > 0:
                        boxes = results[0].boxes
                        best_idx = int(boxes.conf.argmax().item())
                        box = boxes[best_idx]
                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = [int(v) for v in xyxy]
                        pad_x = max(8, int((x2 - x1) * 0.1))
                        pad_y = max(8, int((y2 - y1) * 0.2))
                        x1 = max(0, x1 - pad_x)
                        y1 = max(0, y1 - pad_y)
                        x2 = min(image.shape[1], x2 + pad_x)
                        y2 = min(image.shape[0], y2 + pad_y)
                        bbox = [x1, y1, x2, y2]
                        score = float(box.conf[0].item())
                        crop = image[y1:y2, x1:x2] if image is not None and y2 > y1 and x2 > x1 else image
                        mode = "yolo+ocr"
                else:
                    mode = "ocr-only"
            except Exception:
                mode = "ocr-only"

        ocr_result = run_multi_pass_ocr(image_path, preprocess_for_ocr(crop) if cv2 is not None and crop is not None else crop, cv2)
        if not ocr_result:
            return fail("Plate text could not be recognized.", 3)

        payload = {
            "plate": ocr_result["plate"],
            "confidence": score if score is not None else 0.0,
            "text": ocr_result["text"],
            "bbox": bbox,
            "source": mode,
            "candidates": ocr_result["candidates"],
        }
        print(json.dumps(payload))
        return 0
    except RuntimeError as error:
        return fail(str(error), 4)


if __name__ == "__main__":
    raise SystemExit(main())
