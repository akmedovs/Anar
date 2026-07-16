#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import tempfile
from functools import lru_cache
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
            if not match:
                continue

            plate = match.group(1)
            if len(plate) < 6:
                continue
            if not any(ch.isdigit() for ch in plate):
                continue
            if not any(ch.isalpha() for ch in plate):
                continue
            return plate

    if len(translated) >= 6 and any(ch.isdigit() for ch in translated) and any(ch.isalpha() for ch in translated):
        return translated
    if len(value) >= 6 and any(ch.isdigit() for ch in value) and any(ch.isalpha() for ch in value):
        return value

    return ""


def preprocess_for_ocr(image):
    try:
        import cv2
    except Exception:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return gray


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
    if len(candidate) < 6:
        score -= 100

    return score


STRICT_PLATE_PATTERNS = [
    re.compile(r'^\d{2}[A-Z]{2}\d{3}$'),
    re.compile(r'^\d{1,2}[A-Z]{1,3}\d{2,4}$'),
]

AUTO_ACCEPT_MIN_OCR_SCORE = 0.85
AUTO_ACCEPT_MIN_DET_SCORE = 0.35

OCR_BACKEND_PRIORITY = ('tesseract', 'paddle')


def is_strict_plate(value):
    return any(pattern.fullmatch(value) for pattern in STRICT_PLATE_PATTERNS)


def format_plate_display(value):
    if re.fullmatch(r'\d{2}[A-Z]{2}\d{3}', value):
        return f'{value[:2]} {value[2:4]} {value[4:]}'
    if re.fullmatch(r'\d{1,2}[A-Z]{1,3}\d{2,4}', value):
        match = re.fullmatch(r'(\d{1,2})([A-Z]{1,3})(\d{2,4})', value)
        if match:
            return f'{match.group(1)} {match.group(2)} {match.group(3)}'
    return value


def _cpu_flags():
    try:
        with open('/proc/cpuinfo', 'r', encoding='utf-8', errors='ignore') as handle:
            for line in handle:
                if line.lower().startswith('flags'):
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        return set(parts[1].strip().split())
    except Exception:
        return set()
    return set()


def ocr_backend_order():
    requested = os.environ.get('VEHICLE_OCR_BACKENDS', '').strip().lower()
    if requested:
        order = [item.strip() for item in requested.split(',') if item.strip()]
    else:
        single = os.environ.get('VEHICLE_OCR_BACKEND', 'auto').strip().lower()
        if single in {'paddle', 'tesseract'}:
            order = [single]
        else:
            order = list(OCR_BACKEND_PRIORITY)

    normalized = []
    for backend in order:
        if backend not in {'paddle', 'tesseract'}:
            continue
        if backend not in normalized:
            normalized.append(backend)

    return normalized or list(OCR_BACKEND_PRIORITY)


@lru_cache(maxsize=1)
def selected_ocr_backend():
    return ocr_backend_order()[0]


def tesseract_language():
    value = os.environ.get('VEHICLE_OCR_LANG', 'eng').strip().lower() or 'eng'
    if value == 'en':
        return 'eng'
    return value


def tesseract_configs():
    whitelist = os.environ.get('VEHICLE_TESSERACT_WHITELIST', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-').strip()
    base_flags = [
        '--oem 3 --psm 7',
        '--oem 3 --psm 6',
    ]
    if whitelist:
        return [f'{flags} -c tessedit_char_whitelist={whitelist}' for flags in base_flags]
    return base_flags


def paddle_ocr_worker_path():
    return Path(__file__).with_name('vehicle-ocr-worker.py')


def write_temp_variant(image, cv2_module):
    if image is None:
        return None

    if cv2_module is None:
        return None

    handle = tempfile.NamedTemporaryFile(prefix='vehicle-ocr-', suffix='.png', delete=False)
    handle.close()
    temp_path = Path(handle.name)
    try:
        if not cv2_module.imwrite(str(temp_path), image):
            try:
                temp_path.unlink()
            except Exception:
                pass
            return None
        return temp_path
    except Exception:
        try:
            temp_path.unlink()
        except Exception:
            pass
        return None


def run_paddle_ocr(image, *, image_path=None, cv2_module=None):
    worker = paddle_ocr_worker_path()
    source_path = None
    temp_path = None

    if image is not None and cv2_module is not None:
        temp_path = write_temp_variant(image, cv2_module)
        source_path = temp_path
    elif image_path is not None:
        source_path = Path(image_path)

    if source_path is None:
        raise RuntimeError('PaddleOCR input image is unavailable.')

    timeout_ms = int(os.environ.get('VEHICLE_PADDLE_TIMEOUT_MS', '45000') or '45000')
    timeout_seconds = max(5.0, timeout_ms / 1000.0)
    try:
        completed = subprocess.run(
            [sys.executable, str(worker), str(source_path), tesseract_language()],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink()
            except Exception:
                pass

    stdout = str(completed.stdout or '').strip()
    stderr = str(completed.stderr or '').strip()
    if completed.returncode != 0:
        message = stderr or stdout or f'PaddleOCR worker failed with exit code {completed.returncode}'
        raise RuntimeError(message)

    if not stdout:
        raise RuntimeError('PaddleOCR worker returned empty output.')

    try:
        payload = json.loads(stdout)
    except Exception as error:
        raise RuntimeError(f'PaddleOCR worker returned invalid JSON: {error}')

    if isinstance(payload, dict):
        lines = payload.get('lines') or payload.get('data') or []
    else:
        lines = payload

    return lines


def run_tesseract_ocr(image, config=None):
    try:
        import pytesseract
    except Exception as error:
        raise RuntimeError(f'Tesseract import failed: {error}')

    lang = tesseract_language()
    config = config or os.environ.get('VEHICLE_TESSERACT_CONFIG', '--oem 3 --psm 7').strip() or '--oem 3 --psm 7'

    data = None
    try:
        data = pytesseract.image_to_data(
            image,
            output_type=pytesseract.Output.DICT,
            lang=lang,
            config=config,
        )
    except Exception:
        data = None

    lines = []
    if data and data.get('text'):
        grouped = {}
        count = len(data.get('text', []))
        for index in range(count):
            text = str(data['text'][index] or '').strip()
            if not text:
                continue

            conf_raw = data.get('conf', ['-1'])[index]
            try:
                conf_value = float(conf_raw)
            except (TypeError, ValueError):
                conf_value = -1.0
            if conf_value < 0:
                continue

            if conf_value > 1.0:
                conf_value /= 100.0

            key = (
                data.get('block_num', [0])[index],
                data.get('par_num', [0])[index],
                data.get('line_num', [0])[index],
            )
            grouped.setdefault(key, []).append((text, conf_value))

        for words in grouped.values():
            if not words:
                continue
            joined_text = ' '.join(word for word, _ in words).strip()
            confidence = sum(score for _, score in words) / len(words)
            if joined_text:
                lines.append({'text': joined_text, 'confidence': confidence})

    if not lines:
        try:
            raw_text = pytesseract.image_to_string(image, lang=lang, config=config)
        except Exception as error:
            raise RuntimeError(f'Tesseract OCR failed: {error}')

        raw_text = str(raw_text or '').strip()
        if raw_text:
            lines.append({'text': raw_text, 'confidence': 0.35})

    return lines


def run_backend_ocr(backend, image, image_path, cv2_module):
    if backend == 'paddle':
        return run_paddle_ocr(image, image_path=image_path, cv2_module=cv2_module)

    if backend == 'tesseract':
        return run_tesseract_ocr(image)

    raise RuntimeError(f'Unsupported OCR backend: {backend}')


def iter_ocr_lines(result):
    if not result:
        return []

    if isinstance(result, list) and len(result) == 1 and isinstance(result[0], list):
        items = result[0]
    elif isinstance(result, list):
        items = result
    else:
        items = [result]

    lines = []
    for item in items:
        text = ''
        confidence = None

        if isinstance(item, dict):
            text = str(item.get('text') or item.get('transcription') or '').strip()
            confidence = item.get('score') or item.get('confidence')
        elif isinstance(item, (list, tuple)):
            if len(item) >= 2 and isinstance(item[1], (list, tuple)):
                text = str(item[1][0] or '').strip()
                confidence = item[1][1] if len(item[1]) > 1 else None
            elif len(item) >= 2 and isinstance(item[1], str):
                text = str(item[1] or '').strip()
                confidence = item[2] if len(item) > 2 else None
            elif item and isinstance(item[0], str):
                text = str(item[0]).strip()
                confidence = item[1] if len(item) > 1 else None

        if text:
            confidence_value = normalize_confidence(confidence)

            lines.append({'text': text, 'confidence': confidence_value})

    return lines


def normalize_confidence(value):
    try:
        confidence_value = float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        confidence_value = 0.0

    if confidence_value > 1.0:
        confidence_value /= 100.0

    return max(0.0, min(1.0, confidence_value))


def preprocess_plate_image(image):
    try:
        import cv2
    except Exception:
        return image

    if image is None:
        return None

    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    enlarged = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    blurred = cv2.GaussianBlur(enlarged, (3, 3), 0)
    return blurred


def build_ocr_variants(image):
    try:
        import cv2
    except Exception:
        return [image] if image is not None else []

    if image is None:
        return []

    base = preprocess_plate_image(image)
    if base is None:
        return []

    variants = [base]

    _, otsu = cv2.threshold(base, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(otsu)
    variants.append(cv2.bitwise_not(otsu))

    adaptive = cv2.adaptiveThreshold(
        base,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    variants.append(adaptive)
    variants.append(cv2.bitwise_not(adaptive))

    sharpen_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    sharpened = cv2.filter2D(base, -1, sharpen_kernel)
    variants.append(sharpened)

    return variants


def build_heuristic_regions(image):
    try:
        import cv2
    except Exception:
        return [('full', image)] if image is not None else []

    if image is None:
        return []

    height, width = image.shape[:2]
    regions = [('full', image)]
    boxes = [
        ('lower_center', (0.12, 0.58, 0.88, 0.94)),
        ('lower_wide', (0.08, 0.50, 0.92, 0.98)),
        ('lower_mid', (0.18, 0.62, 0.84, 0.92)),
    ]

    for label, (left, top, right, bottom) in boxes:
        x1 = max(0, int(width * left))
        y1 = max(0, int(height * top))
        x2 = min(width, int(width * right))
        y2 = min(height, int(height * bottom))
        if x2 - x1 < 40 or y2 - y1 < 20:
            continue
        regions.append((label, image[y1:y2, x1:x2]))

    return regions


def dedupe_candidates(candidates):
    best_by_plate = {}
    for candidate in candidates:
        plate = candidate.get('plate') or ''
        current = best_by_plate.get(plate)
        if current is None:
            best_by_plate[plate] = candidate
            continue

        current_key = (current.get('score', 0), current.get('confidence', 0), len(current.get('plate', '')))
        candidate_key = (candidate.get('score', 0), candidate.get('confidence', 0), len(candidate.get('plate', '')))
        if candidate_key > current_key:
            best_by_plate[plate] = candidate

    merged = list(best_by_plate.values())
    merged.sort(key=lambda item: (item['score'], item['confidence'], len(item['plate'])), reverse=True)
    return merged


def heuristic_plate_crop(image):
    regions = build_heuristic_regions(image)
    for label, region in regions:
        if label == 'lower_center' and region is not None:
            return region
    return image


def compute_candidate_score(text_score, detector_score, plate):
    score = (text_score or 0.0) * 100.0
    if detector_score is not None:
        score += max(0.0, min(1.0, detector_score)) * 35.0
    score += plate_score(plate)
    if is_strict_plate(plate):
        score += 100.0
    if len(plate) < 6:
        score -= 1000.0
    return score


def extract_candidates(ocr_lines, detector_score, source_label, region_label, strict_only=True, backend='unknown'):
    candidates = []
    for line in ocr_lines:
        text = str(line.get('text') or '').strip()
        if not text:
            continue

        plate = normalize_plate_candidate(text)
        if not plate:
            continue

        strict = is_strict_plate(plate)
        if strict_only and not strict:
            continue
        if not strict_only and (len(plate) < 5 or not any(ch.isdigit() for ch in plate) or not any(ch.isalpha() for ch in plate)):
            continue

        text_score = float(line.get('confidence') or 0.0)
        candidate = {
            'plate': plate,
            'displayPlate': format_plate_display(plate),
            'text': text,
            'confidence': round(text_score, 4),
            'score': round(compute_candidate_score(text_score, detector_score, plate), 2),
            'source': source_label,
            'region': region_label,
            'backend': backend,
            'strict': strict,
        }
        candidates.append(candidate)

    return candidates


def detect_plate_region(image_path, image):
    model_path = os.environ.get('VEHICLE_YOLO_MODEL', '').strip()
    if not model_path:
        return {
            'bbox': None,
            'confidence': None,
            'crop': heuristic_plate_crop(image),
            'source': 'manual-review',
            'reason': 'YOLO modeli qurulmadi, heuristic crop isledildi',
            'configured': False,
        }

    try:
        from ultralytics import YOLO
    except Exception as error:
        return {
            'bbox': None,
            'confidence': None,
            'crop': image,
            'source': 'manual-review',
            'reason': f'YOLO import failed: {error}',
            'configured': True,
        }

    model_file = Path(model_path)
    if not model_file.exists():
        return {
            'bbox': None,
            'confidence': None,
            'crop': image,
            'source': 'manual-review',
            'reason': f'YOLO modeli tapilmadi: {model_file}',
            'configured': True,
        }

    try:
        model = YOLO(str(model_file))
        conf = float(os.environ.get('VEHICLE_YOLO_CONF', '0.25'))
        source = image if image is not None else str(image_path)
        results = model.predict(source=source, verbose=False, conf=conf)
    except Exception as error:
        return {
            'bbox': None,
            'confidence': None,
            'crop': heuristic_plate_crop(image),
            'source': 'manual-review',
            'reason': f'YOLO inference failed: {error}',
            'configured': True,
        }

    if not results or results[0].boxes is None or len(results[0].boxes) == 0:
        return {
            'bbox': None,
            'confidence': None,
            'crop': heuristic_plate_crop(image),
            'source': 'manual-review',
            'reason': 'Nömrə üçün YOLO deteksiyası tapilmadi, heuristic crop isledildi',
            'configured': True,
        }

    boxes = results[0].boxes
    best_idx = int(boxes.conf.argmax().item())
    box = boxes[best_idx]
    xyxy = box.xyxy[0].tolist()
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    pad_x = max(8, int((x2 - x1) * 0.12))
    pad_y = max(6, int((y2 - y1) * 0.25))
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(image.shape[1], x2 + pad_x)
    y2 = min(image.shape[0], y2 + pad_y)
    crop = image[y1:y2, x1:x2] if image is not None and y2 > y1 and x2 > x1 else image

    return {
        'bbox': [x1, y1, x2, y2],
        'confidence': float(box.conf[0].item()),
        'crop': crop,
        'source': 'yolo',
        'reason': None,
        'configured': True,
    }

def run_multi_pass_ocr(image_path, image, cv2_module):
    strict_candidates = []
    loose_candidates = []

    if image is None:
        return None

    backends = ocr_backend_order()
    regions = [("full", image)]
    if image is not None and image.shape[1] > image.shape[0]:
        regions.append(("lower_center", heuristic_plate_crop(image)))
    regions = [(label, region) for label, region in regions if region is not None]

    for backend in backends:
        for region_label, region in regions:
            if region is None:
                continue

            variants = build_ocr_variants(region)[:3]
            for variant_index, variant in enumerate(variants):
                if backend == 'paddle':
                    try:
                        ocr_result = run_backend_ocr(backend, variant, image_path, cv2_module)
                    except Exception:
                        continue

                    lines = iter_ocr_lines(ocr_result)
                    if not lines:
                        continue
                    strict_candidates.extend(extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=True, backend=backend))
                    loose_candidates.extend(extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=False, backend=backend))
                    continue

                for ocr_config in tesseract_configs():
                    try:
                        ocr_result = run_tesseract_ocr(variant, config=ocr_config)
                    except Exception:
                        continue

                    lines = iter_ocr_lines(ocr_result)
                    if not lines:
                        continue

                    strict_candidates.extend(extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=True, backend=backend))
                    loose_candidates.extend(extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=False, backend=backend))

    candidates = dedupe_candidates(strict_candidates + loose_candidates)
    if not candidates:
        return None

    best = candidates[0]
    return {
        'plate': best['plate'],
        'displayPlate': best['displayPlate'],
        'text': best['text'],
        'score': best['score'],
        'confidence': best['confidence'],
        'source': best['source'],
        'backend': best['backend'],
        'strictPlate': bool(best.get('strict')),
        'candidates': candidates[:5],
        'backendsTried': backends,
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

        detector = detect_plate_region(image_path, image)
        crop = detector['crop'] if detector else image
        detector_confidence = detector['confidence'] if detector else None
        detector_source = 'yolo' if detector and detector.get('bbox') else 'manual-review'

        ocr_result = run_multi_pass_ocr(image_path, crop, cv2)

        if not ocr_result:
            payload = {
                'status': 'manual_review',
                'manualReviewRequired': True,
                'reason': detector.get('reason') if detector else 'Plate text could not be recognized.',
                'plate': '',
                'displayPlate': '',
                'confidence': 0.0,
                'text': '',
                'bbox': detector.get('bbox') if detector else None,
                'source': detector_source,
                'ocrBackend': selected_ocr_backend(),
                'detectorConfidence': detector_confidence,
                'candidates': [],
            }
            print(json.dumps(payload))
            return 0

        best_plate = ocr_result['plate']
        best_display_plate = ocr_result.get('displayPlate') or format_plate_display(best_plate)
        ocr_confidence = float(ocr_result.get('confidence') or 0.0)
        detector_ok = detector_confidence is not None and detector_confidence >= AUTO_ACCEPT_MIN_DET_SCORE
        strict_plate = bool(ocr_result.get('strictPlate'))
        auto_accept = bool(
            detector.get('configured', False)
            and detector.get('bbox')
            and detector_ok
            and ocr_confidence >= AUTO_ACCEPT_MIN_OCR_SCORE
            and best_plate
            and strict_plate
        )

        manual_review_required = not auto_accept
        reason = None
        if not detector.get('configured', False):
            reason = 'YOLO modeli qurulmayib'
            manual_review_required = True
        elif not detector.get('bbox'):
            reason = detector.get('reason') or 'Nömrə üçün YOLO deteksiyası tapilmadi'
        elif not detector_ok:
            reason = 'YOLO confidence azdir'
        elif ocr_confidence < AUTO_ACCEPT_MIN_OCR_SCORE:
            reason = 'PaddleOCR confidence azdir'
        elif best_plate and not strict_plate:
            reason = 'Strict regex namizəd tapilmadi'
        else:
            reason = reason or 'Plate text could not be recognized.'

        payload = {
            'status': 'accepted' if not manual_review_required else 'manual_review',
            'manualReviewRequired': manual_review_required,
            'reason': reason,
            'plate': best_plate,
            'displayPlate': best_display_plate,
            'confidence': ocr_confidence,
            'text': ocr_result['text'],
            'bbox': detector.get('bbox') if detector else None,
            'source': f"yolo+{ocr_result.get('backend') or selected_ocr_backend()}" if detector.get('bbox') else f"{ocr_result.get('backend') or selected_ocr_backend()}-review",
            'ocrBackend': ocr_result.get('backend') or selected_ocr_backend(),
            'detectorConfidence': detector_confidence,
            'candidates': ocr_result['candidates'],
        }
        print(json.dumps(payload))
        return 0
    except RuntimeError as error:
        return fail(str(error), 4)


if __name__ == "__main__":
    raise SystemExit(main())
