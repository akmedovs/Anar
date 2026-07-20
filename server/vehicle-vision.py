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


def parse_az_license_plate(ocr_text):
    value = re.sub(r'[^A-Z0-9]', '', (ocr_text or '').upper())
    if not value or len(value) < 7:
        return ''

    digit_to_char = {
        '0': 'O',
        '1': 'I',
        '8': 'B',
        '5': 'S',
    }
    char_to_digit = {
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
    }

    def normalize_window(window):
        if len(window) != 7:
            return ''

        chars = list(window)

        for index in range(2):
            if chars[index] in char_to_digit:
                chars[index] = char_to_digit[chars[index]]

        for index in range(2, 4):
            if chars[index] in digit_to_char:
                chars[index] = digit_to_char[chars[index]]

        for index in range(4, 7):
            if chars[index] in char_to_digit:
                chars[index] = char_to_digit[chars[index]]

        candidate = ''.join(chars)
        if re.fullmatch(r'\d{2}[A-Z]{2}\d{3}', candidate):
            return candidate
        return ''

    for start in range(0, len(value) - 6):
        candidate = normalize_window(value[start:start + 7])
        if candidate:
            return candidate

    return ''


def normalize_plate_candidate(raw):
    value = re.sub(r"[^A-Z0-9]", "", (raw or "").upper())
    if not value:
        return ""

    exact = re.search(r'(\d{2}[A-Z]{2}\d{3})', value)
    if exact:
        return exact.group(1)

    # Do not synthesize plates from long noisy OCR lines.
    # Example: "SSS 4 S32 A BOS 4" can be over-corrected into "32AB054".
    # Short near-misses such as "410UK075-" are still allowed and become "10UK075".
    if len(value) > 10:
        return ""

    corrected = parse_az_license_plate(value)
    if corrected:
        return corrected

    return ""


def preprocess_for_ocr(image):
    try:
        import cv2
    except Exception:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    crop_y = int(h * 0.05)
    crop_x = int(w * 0.08)
    if h - crop_y * 2 > 0 and w - crop_x * 2 > 0:
        gray = gray[crop_y:h - crop_y, crop_x:w - crop_x]
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return gray


def preprocess_for_wash(cropped_plate):
    try:
        import cv2
    except Exception:
        return None

    if cropped_plate is None or getattr(cropped_plate, 'size', 0) == 0:
        return None

    if len(cropped_plate.shape) == 3:
        gray = cv2.cvtColor(cropped_plate, cv2.COLOR_BGR2GRAY)
    else:
        gray = cropped_plate

    h, w = gray.shape[:2]
    crop_y = int(h * 0.05)
    crop_x = int(w * 0.08)
    if h - crop_y * 2 > 0 and w - crop_x * 2 > 0:
        gray = gray[crop_y:h - crop_y, crop_x:w - crop_x]

    if gray.shape[0] < 20 or gray.shape[1] < 60:
        return None

    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    thresh = cv2.threshold(
        enhanced,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )[1]

    return thresh


def plate_score(candidate):
    if not candidate:
        return 0

    score = len(candidate)
    if re.fullmatch(r'\d{2}[A-Z]{2}\d{3}', candidate):
        score += 100
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
]

AUTO_ACCEPT_MIN_OCR_SCORE = 0.85
AUTO_ACCEPT_MIN_DET_SCORE = 0.35

OCR_BACKEND_PRIORITY = ('tesseract',)


def is_strict_plate(value):
    return any(pattern.fullmatch(value) for pattern in STRICT_PLATE_PATTERNS)


def format_plate_display(value):
    if re.fullmatch(r'\d{2}[A-Z]{2}\d{3}', value):
        return f'{value[:2]} {value[2:4]} {value[4:]}'
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

    h, w = gray.shape[:2]
    crop_y = int(h * 0.04)
    crop_x = int(w * 0.04)
    if h - crop_y * 2 > 0 and w - crop_x * 2 > 0:
        gray = gray[crop_y:h - crop_y, crop_x:w - crop_x]

    target_height = 90
    scale = max(1.5, min(4.0, target_height / max(1, gray.shape[0])))
    enlarged = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    denoised = cv2.bilateralFilter(enlarged, 7, 45, 45)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    sharpen = cv2.GaussianBlur(enhanced, (0, 0), 1.0)
    sharpened = cv2.addWeighted(enhanced, 1.5, sharpen, -0.5, 0)
    return sharpened


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

    _, otsu = cv2.threshold(base, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        base,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )

    # Keep the high-yield variants first because production limits max variants for speed.
    variants = [otsu, adaptive, base, cv2.bitwise_not(otsu)]

    wash_variant = preprocess_for_wash(image)
    if wash_variant is not None:
        variants.append(wash_variant)

    unique = []
    seen = set()
    for variant in variants:
        if variant is None:
            continue
        key = (variant.shape[:2], variant.tobytes()[:2048])
        if key in seen:
            continue
        seen.add(key)
        unique.append(variant)
    return unique


def _append_region(regions, seen, label, image, x1, y1, x2, y2):
    if image is None:
        return
    height, width = image.shape[:2]
    x1 = max(0, min(width, int(x1)))
    x2 = max(0, min(width, int(x2)))
    y1 = max(0, min(height, int(y1)))
    y2 = max(0, min(height, int(y2)))
    if x2 - x1 < 50 or y2 - y1 < 18:
        return
    key = (round(x1 / 8), round(y1 / 8), round(x2 / 8), round(y2 / 8))
    if key in seen:
        return
    seen.add(key)
    regions.append((label, image[y1:y2, x1:x2]))


def detect_candidate_plate_regions(image):
    try:
        import cv2
    except Exception:
        return []

    if image is None:
        return []

    height, width = image.shape[:2]
    if height < 60 or width < 120:
        return []

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    gray = cv2.bilateralFilter(gray, 7, 45, 45)
    blackhat_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 7))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, blackhat_kernel)
    grad_x = cv2.Sobel(blackhat, cv2.CV_32F, 1, 0, ksize=3)
    grad_x = cv2.convertScaleAbs(grad_x)
    grad_x = cv2.GaussianBlur(grad_x, (5, 5), 0)
    closed_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (23, 5))
    closed = cv2.morphologyEx(grad_x, cv2.MORPH_CLOSE, closed_kernel)
    thresh = cv2.threshold(closed, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    thresh = cv2.erode(thresh, None, iterations=1)
    thresh = cv2.dilate(thresh, None, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < width * 0.12 or h < height * 0.025:
            continue
        aspect = w / max(1, h)
        if aspect < 2.0 or aspect > 7.5:
            continue
        area_ratio = (w * h) / max(1, width * height)
        if area_ratio < 0.003 or area_ratio > 0.25:
            continue
        center_bias = 1.0 - min(1.0, abs((y + h / 2) - height * 0.68) / max(1, height))
        score = area_ratio * 100.0 + center_bias * 2.0 + min(aspect, 5.0) * 0.2
        boxes.append((score, x, y, w, h))

    boxes.sort(reverse=True)
    regions = []
    for index, (_, x, y, w, h) in enumerate(boxes[:4]):
        pad_x = max(8, int(w * 0.18))
        pad_y = max(6, int(h * 0.45))
        regions.append((f'contour_plate_{index + 1}', x - pad_x, y - pad_y, x + w + pad_x, y + h + pad_y))
    return regions


def build_heuristic_regions(image):
    if image is None:
        return []

    height, width = image.shape[:2]
    regions = []
    seen = set()

    for label, x1, y1, x2, y2 in detect_candidate_plate_regions(image):
        _append_region(regions, seen, label, image, x1, y1, x2, y2)

    boxes = [
        ('lower_center', (0.16, 0.56, 0.84, 0.92)),
        ('lower_wide', (0.08, 0.50, 0.92, 0.98)),
        ('middle_lower', (0.12, 0.42, 0.88, 0.82)),
    ]

    for label, (left, top, right, bottom) in boxes:
        _append_region(regions, seen, label, image, width * left, height * top, width * right, height * bottom)

    regions.append(('full', image))
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
        if not strict_only and (len(plate) < 7 or not any(ch.isdigit() for ch in plate) or not any(ch.isalpha() for ch in plate)):
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
            'crop': image,
            'source': 'manual-review',
            'reason': 'YOLO modeli qurulmadi, full image OCR isledildi',
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
            'crop': image,
            'source': 'manual-review',
            'reason': f'YOLO inference failed: {error}',
            'configured': True,
        }

    if not results or results[0].boxes is None or len(results[0].boxes) == 0:
        return {
            'bbox': None,
            'confidence': None,
            'crop': image,
            'source': 'manual-review',
            'reason': 'Nömrə üçün YOLO deteksiyası tapilmadi, full image OCR isledildi',
            'configured': True,
        }

    image_h, image_w = image.shape[:2]
    boxes = results[0].boxes
    valid_boxes = []
    for index, candidate_box in enumerate(boxes):
        cx1, cy1, cx2, cy2 = [float(v) for v in candidate_box.xyxy[0].tolist()]
        box_w = max(1.0, cx2 - cx1)
        box_h = max(1.0, cy2 - cy1)
        aspect = box_w / box_h
        area_ratio = (box_w * box_h) / max(1.0, float(image_w * image_h))
        confidence = float(candidate_box.conf[0].item())
        if aspect < 1.8 or aspect > 8.0:
            continue
        if area_ratio < 0.0008 or area_ratio > 0.18:
            continue
        valid_boxes.append((confidence, -area_ratio, index, candidate_box))

    if not valid_boxes:
        return {
            'bbox': None,
            'confidence': None,
            'crop': image,
            'source': 'manual-review',
            'reason': 'YOLO deteksiyası nömrə ölçüsünə uyğun deyil, heuristic OCR isledildi',
            'configured': True,
        }

    valid_boxes.sort(reverse=True)
    box = valid_boxes[0][3]
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

    requested_backends = ocr_backend_order()
    backend_order = [backend for backend in ('tesseract', 'paddle') if backend in requested_backends]
    backend_order += [backend for backend in requested_backends if backend not in backend_order]
    max_variants = max(1, int(os.environ.get('VEHICLE_OCR_MAX_VARIANTS', '2') or '2'))
    max_regions = max(1, int(os.environ.get('VEHICLE_OCR_MAX_REGIONS', '2') or '2'))
    early_accept = float(os.environ.get('VEHICLE_OCR_EARLY_ACCEPT_SCORE', str(AUTO_ACCEPT_MIN_OCR_SCORE)) or AUTO_ACCEPT_MIN_OCR_SCORE)

    image_h, image_w = image.shape[:2]
    image_aspect = image_w / max(1, image_h)
    looks_like_plate_crop = image_aspect >= 1.8 and image_h <= 260

    if looks_like_plate_crop:
        # YOLO already returned a plate-shaped crop; try it before cutting it again.
        regions = [('detected_plate', image)] + build_heuristic_regions(image)
    else:
        regions = build_heuristic_regions(image)

    regions = [(label, region) for label, region in regions if region is not None][:max_regions]

    for backend in backend_order:
        for region_label, region in regions:
            if region is None:
                continue

            variants = build_ocr_variants(region)[:max_variants]
            for variant_index, variant in enumerate(variants):
                if backend == 'paddle':
                    try:
                        ocr_result = run_backend_ocr(backend, variant, image_path, cv2_module)
                    except Exception:
                        continue

                    lines = iter_ocr_lines(ocr_result)
                    if not lines:
                        continue
                    strict = extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=True, backend=backend)
                    loose = extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=False, backend=backend)
                    strict_candidates.extend(strict)
                    loose_candidates.extend(loose)
                    if strict:
                        current_best = dedupe_candidates(strict_candidates)[0]
                        if current_best.get('confidence', 0) >= early_accept:
                            candidates = dedupe_candidates(strict_candidates + loose_candidates)
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
                                'backendsTried': backend_order,
                            }
                    continue

                for ocr_config in tesseract_configs():
                    try:
                        ocr_result = run_tesseract_ocr(variant, config=ocr_config)
                    except Exception:
                        continue

                    lines = iter_ocr_lines(ocr_result)
                    if not lines:
                        continue

                    strict = extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=True, backend=backend)
                    loose = extract_candidates(lines, None, f'{backend}:{region_label}', f'{region_label}:{variant_index}', strict_only=False, backend=backend)
                    strict_candidates.extend(strict)
                    loose_candidates.extend(loose)
                    if strict:
                        current_best = dedupe_candidates(strict_candidates)[0]
                        if current_best.get('confidence', 0) >= early_accept:
                            candidates = dedupe_candidates(strict_candidates + loose_candidates)
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
                                'backendsTried': backend_order,
                            }

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
        'backendsTried': backend_order,
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
        backend_name = ocr_result.get('backend') or selected_ocr_backend()
        candidate_regions = [str(item.get('region') or '') for item in ocr_result.get('candidates', [])]
        yolo_tesseract_strict_ok = bool(
            backend_name == 'tesseract'
            and detector_confidence is not None
            and detector_confidence >= 0.60
            and strict_plate
            and any(region.startswith('detected_plate:') for region in candidate_regions)
        )
        ocr_ok = ocr_confidence >= AUTO_ACCEPT_MIN_OCR_SCORE or yolo_tesseract_strict_ok
        effective_confidence = max(ocr_confidence, detector_confidence or 0.0) if yolo_tesseract_strict_ok else ocr_confidence
        auto_accept = bool(
            detector.get('configured', False)
            and detector.get('bbox')
            and detector_ok
            and ocr_ok
            and best_plate
            and strict_plate
        )

        manual_review_required = not auto_accept
        reason = None
        if not manual_review_required:
            reason = None
        elif not detector.get('configured', False):
            reason = 'YOLO modeli qurulmayib'
            manual_review_required = True
        elif not detector.get('bbox'):
            reason = detector.get('reason') or 'Nömrə üçün YOLO deteksiyası tapilmadi'
        elif not detector_ok:
            reason = 'YOLO confidence azdir'
        elif not ocr_ok:
            reason = 'OCR confidence azdir'
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
            'confidence': round(effective_confidence, 4),
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
