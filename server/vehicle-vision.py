#!/usr/bin/env python3
import json
import os
import shlex
import re
import subprocess
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


def preprocess_for_ocr(image):
    try:
        import cv2
    except Exception:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.GaussianBlur(gray, (3, 3), 0)


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

        ocr_config = os.environ.get(
            "VEHICLE_OCR_CONFIG",
            "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        )
        if cv2 is not None and crop is not None:
            ocr_input = preprocess_for_ocr(crop)
            temp_path = image_path.with_suffix('.ocr.png')
            try:
                cv2.imwrite(str(temp_path), ocr_input)
                ocr_text = run_tesseract_ocr(temp_path, ocr_config)
            finally:
                if temp_path.exists():
                    temp_path.unlink()
        else:
            ocr_text = run_tesseract_ocr(image_path, ocr_config)
        plate = clean_plate(ocr_text)

        if not plate:
            return fail("Plate text could not be recognized.", 3)

        payload = {
            "plate": plate,
            "confidence": score if score is not None else 0.0,
            "text": ocr_text.strip(),
            "bbox": bbox,
            "source": mode,
        }
        print(json.dumps(payload))
        return 0
    except RuntimeError as error:
        return fail(str(error), 4)


if __name__ == "__main__":
    raise SystemExit(main())
