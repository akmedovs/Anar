#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path


def fail(message, code=1):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def clean_plate(raw):
    value = re.sub(r"[^A-Z0-9-]", "", (raw or "").upper().replace(" ", ""))
    if not value:
        return ""

    match = re.search(r"([A-Z0-9-]{4,12})", value)
    return match.group(1) if match else value


def main():
    if len(sys.argv) < 2:
        return fail("Image path is required.", 2)

    image_path = Path(sys.argv[1])
    if not image_path.exists():
        return fail(f"Image not found: {image_path}", 2)

    model_path = os.environ.get("VEHICLE_YOLO_MODEL", "").strip()
    if not model_path:
        return fail("VEHICLE_YOLO_MODEL is not set. Provide a trained plate detector model.")

    try:
        import cv2
        from ultralytics import YOLO
    except Exception as exc:
        return fail(f"YOLO dependencies are missing: {exc}")

    try:
        import pytesseract
    except Exception as exc:
        return fail(f"OCR dependency is missing: {exc}")

    model_file = Path(model_path)
    if not model_file.exists():
        return fail(f"YOLO model not found: {model_file}")

    image = cv2.imread(str(image_path))
    if image is None:
        return fail(f"Unable to read image: {image_path}")

    model = YOLO(str(model_file))
    conf = float(os.environ.get("VEHICLE_YOLO_CONF", "0.25"))
    results = model.predict(source=image, verbose=False, conf=conf)

    bbox = None
    score = None
    crop = image

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
        crop = image[y1:y2, x1:x2] if y2 > y1 and x2 > x1 else image

    ocr_config = os.environ.get(
        "VEHICLE_OCR_CONFIG",
        "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    )
    ocr_text = pytesseract.image_to_string(crop, config=ocr_config)
    plate = clean_plate(ocr_text)

    if not plate:
        return fail("Plate text could not be recognized.", 3)

    payload = {
        "plate": plate,
        "confidence": score if score is not None else 0.0,
        "text": ocr_text.strip(),
        "bbox": bbox,
        "source": "yolo+ocr",
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
