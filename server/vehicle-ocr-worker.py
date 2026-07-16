#!/usr/bin/env python3
import json
import re
import sys


def fail(message, code=1):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def normalize_confidence(value):
    try:
        confidence_value = float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        confidence_value = 0.0

    if confidence_value > 1.0:
        confidence_value /= 100.0

    return max(0.0, min(1.0, confidence_value))


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
            lines.append({'text': text, 'confidence': normalize_confidence(confidence)})

    return lines


def load_image(image_path):
    try:
        import cv2
    except Exception as error:
        raise RuntimeError(f'OpenCV import failed: {error}')

    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f'Unable to read image: {image_path}')
    return image


def load_ocr():
    try:
        from paddleocr import PaddleOCR
    except Exception as error:
        raise RuntimeError(f'PaddleOCR import failed: {error}')

    lang = (sys.argv[2] if len(sys.argv) > 2 else 'en').strip() or 'en'
    kwargs = {
        'lang': lang,
        'show_log': False,
    }

    # Different PaddleOCR releases accept different constructor arguments.
    for extra in (
        {
            'use_doc_orientation_classify': False,
            'use_doc_unwarping': False,
            'use_textline_orientation': False,
        },
        {},
    ):
        try:
            return PaddleOCR(**kwargs, **extra)
        except TypeError:
            continue

    return PaddleOCR(**kwargs)


def run_ocr(ocr, image):
    if hasattr(ocr, 'ocr'):
        return ocr.ocr(image, cls=True)

    if hasattr(ocr, 'predict'):
        return ocr.predict(image)

    raise RuntimeError('PaddleOCR API is not supported by the installed version.')


def main():
    if len(sys.argv) < 2:
        return fail('Image path is required.', 2)

    image_path = sys.argv[1]
    try:
        image = load_image(image_path)
        ocr = load_ocr()
        result = run_ocr(ocr, image)
        payload = {'backend': 'paddle', 'lines': iter_ocr_lines(result)}
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as error:
        return fail(str(error), 4)


if __name__ == '__main__':
    raise SystemExit(main())
