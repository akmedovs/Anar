#!/usr/bin/env python3
import base64
import importlib.util
import json
import os
import re
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


def load_legacy_pipeline():
    module_path = Path(__file__).with_name("vehicle-vision.py")
    spec = importlib.util.spec_from_file_location("vehicle_vision_legacy", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load legacy pipeline: {module_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


legacy = load_legacy_pipeline()
app = FastAPI(title="Vehicle Vision Service", version="1.0.0")


class RecognizeRequest(BaseModel):
    imagePath: str | None = None
    imageDataUrl: str | None = None


def fail(message, code=1):
    raise HTTPException(status_code=code, detail=message)


def ocr_backend_order():
    requested = os.environ.get("VEHICLE_OCR_BACKENDS", "tesseract").strip().lower()
    order = [item.strip() for item in requested.split(",") if item.strip()]
    normalized = []
    for backend in order:
        if backend in {"easyocr", "paddle", "tesseract"} and backend not in normalized:
            normalized.append(backend)
    return normalized or ["tesseract"]


def tesseract_language():
    return legacy.tesseract_language()


@lru_cache(maxsize=1)
def easyocr_reader():
    try:
        import easyocr
    except Exception as error:
        raise RuntimeError(f"EasyOCR import failed: {error}")

    lang = tesseract_language()
    langs = ["en"] if lang in {"en", "eng"} else [lang]
    gpu = os.environ.get("VEHICLE_EASYOCR_GPU", "false").strip().lower() in {"1", "true", "yes"}
    return easyocr.Reader(langs, gpu=gpu)


def run_easyocr_ocr(image):
    if image is None:
        raise RuntimeError("EasyOCR input image is unavailable.")

    reader = easyocr_reader()
    allowlist = os.environ.get(
        "VEHICLE_EASYOCR_ALLOWLIST",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    ).strip()

    try:
        results = reader.readtext(
            image,
            detail=1,
            paragraph=False,
            allowlist=allowlist or None,
        )
    except TypeError:
        results = reader.readtext(
            image,
            detail=1,
            paragraph=False,
        )

    lines = []
    for item in results or []:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        text = str(item[1] or "").strip()
        if not text:
            continue
        confidence = item[2] if len(item) > 2 else 0.0
        lines.append({
            "text": text,
            "confidence": legacy.normalize_confidence(confidence),
        })
    return lines


def load_image(image_path):
    try:
        import cv2
    except Exception as error:
        raise RuntimeError(f"OpenCV import failed: {error}")

    path = Path(image_path)
    if not path.exists():
        raise RuntimeError(f"Image not found: {path}")

    image = cv2.imread(str(path))
    if image is None:
        raise RuntimeError(f"Unable to read image: {path}")

    return cv2, image


def save_image_data_url(image_data_url):
    payload = str(image_data_url or "").strip()
    if not payload:
        return None

    if "," not in payload:
        return None

    _, encoded = payload.split(",", 1)
    try:
        raw = base64.b64decode(encoded)
    except Exception as error:
        raise RuntimeError(f"Invalid imageDataUrl payload: {error}")

    handle = tempfile.NamedTemporaryFile(prefix="vehicle-vision-", suffix=".png", delete=False)
    handle.write(raw)
    handle.close()
    return handle.name


def run_multi_pass_ocr(image_path, image, cv2_module):
    if image is None:
        return None

    requested_backends = ocr_backend_order()
    backend_order = [backend for backend in ("tesseract", "easyocr", "paddle") if backend in requested_backends]
    backend_order += [backend for backend in requested_backends if backend not in backend_order]
    max_variants = max(1, int(os.environ.get("VEHICLE_OCR_MAX_VARIANTS", "2") or "2"))
    max_regions = max(1, int(os.environ.get("VEHICLE_OCR_MAX_REGIONS", "2") or "2"))
    early_accept = float(os.environ.get("VEHICLE_OCR_EARLY_ACCEPT_SCORE", str(legacy.AUTO_ACCEPT_MIN_OCR_SCORE)) or legacy.AUTO_ACCEPT_MIN_OCR_SCORE)

    image_h, image_w = image.shape[:2]
    image_aspect = image_w / max(1, image_h)
    looks_like_plate_crop = image_aspect >= 1.8 and image_h <= 260

    if looks_like_plate_crop:
        # YOLO already returned a plate-shaped crop; try it before cutting it again.
        regions = [("detected_plate", image)] + legacy.build_heuristic_regions(image)
    else:
        regions = legacy.build_heuristic_regions(image)

    regions = [(label, region) for label, region in regions if region is not None][:max_regions]

    strict_candidates = []
    loose_candidates = []

    def make_result(candidates):
        best = candidates[0]
        return {
            "plate": best["plate"],
            "displayPlate": best["displayPlate"],
            "text": best["text"],
            "score": best["score"],
            "confidence": best["confidence"],
            "source": best["source"],
            "backend": best["backend"],
            "strictPlate": bool(best.get("strict")),
            "candidates": candidates[:5],
            "backendsTried": backend_order,
        }

    for backend in backend_order:
        for region_label, region in regions:
            if region is None:
                continue

            variants = legacy.build_ocr_variants(region)[:max_variants]
            for variant_index, variant in enumerate(variants):
                if backend == "easyocr":
                    try:
                        lines = run_easyocr_ocr(variant)
                    except Exception:
                        continue
                elif backend == "paddle":
                    try:
                        ocr_result = legacy.run_backend_ocr(backend, variant, image_path, cv2_module)
                    except Exception:
                        continue
                    lines = legacy.iter_ocr_lines(ocr_result)
                else:
                    tesseract_lines = []
                    for ocr_config in legacy.tesseract_configs():
                        try:
                            ocr_result = legacy.run_tesseract_ocr(variant, config=ocr_config)
                        except Exception:
                            continue
                        tesseract_lines.extend(legacy.iter_ocr_lines(ocr_result))
                    lines = tesseract_lines

                if not lines:
                    continue

                strict = legacy.extract_candidates(
                    lines,
                    None,
                    f"{backend}:{region_label}",
                    f"{region_label}:{variant_index}",
                    strict_only=True,
                    backend=backend,
                )
                loose = legacy.extract_candidates(
                    lines,
                    None,
                    f"{backend}:{region_label}",
                    f"{region_label}:{variant_index}",
                    strict_only=False,
                    backend=backend,
                )
                strict_candidates.extend(strict)
                loose_candidates.extend(loose)

                if strict:
                    current_best = legacy.dedupe_candidates(strict_candidates)[0]
                    if current_best.get("confidence", 0) >= early_accept:
                        return make_result(legacy.dedupe_candidates(strict_candidates + loose_candidates))

    candidates = legacy.dedupe_candidates(strict_candidates + loose_candidates)
    if not candidates:
        return None

    return make_result(candidates)


def build_payload(image_path, detector, ocr_result):
    detector_confidence = detector.get("confidence") if detector else None
    detector_bbox = detector.get("bbox") if detector else None
    detector_source = "yolo" if detector_bbox else "manual-review"

    if not ocr_result:
        return {
            "status": "manual_review",
            "manualReviewRequired": True,
            "reason": detector.get("reason") if detector else "Plate text could not be recognized.",
            "plate": "",
            "displayPlate": "",
            "confidence": 0.0,
            "text": "",
            "bbox": detector_bbox,
            "source": detector_source,
            "ocrBackend": ocr_backend_order()[0],
            "detectorConfidence": detector_confidence,
            "candidates": [],
            "backendsTried": ocr_backend_order(),
        }

    best_plate = ocr_result["plate"]
    best_display_plate = ocr_result.get("displayPlate") or legacy.format_plate_display(best_plate)
    ocr_confidence = float(ocr_result.get("confidence") or 0.0)
    detector_ok = detector_confidence is not None and detector_confidence >= legacy.AUTO_ACCEPT_MIN_DET_SCORE
    strict_plate = bool(ocr_result.get("strictPlate"))
    backend_name = ocr_result.get("backend") or selected_ocr_backend()
    candidate_regions = [str(item.get("region") or "") for item in ocr_result.get("candidates", [])]
    yolo_tesseract_strict_ok = bool(
        backend_name == "tesseract"
        and detector_confidence is not None
        and detector_confidence >= 0.60
        and strict_plate
        and any(region.startswith("detected_plate:") for region in candidate_regions)
    )
    ocr_ok = ocr_confidence >= legacy.AUTO_ACCEPT_MIN_OCR_SCORE or yolo_tesseract_strict_ok
    effective_confidence = max(ocr_confidence, detector_confidence or 0.0) if yolo_tesseract_strict_ok else ocr_confidence
    auto_accept = bool(
        detector.get("configured", False)
        and detector_bbox
        and detector_ok
        and ocr_ok
        and best_plate
        and strict_plate
    )

    manual_review_required = not auto_accept
    if not manual_review_required:
        reason = None
    elif not detector.get("configured", False):
        reason = "YOLO modeli qurulmayib"
        manual_review_required = True
    elif not detector_bbox:
        reason = detector.get("reason") or "Nömrə üçün YOLO deteksiyası tapilmadi"
    elif not detector_ok:
        reason = "YOLO confidence azdir"
    elif not ocr_ok:
        reason = "OCR confidence azdir"
    elif best_plate and not strict_plate:
        reason = "Strict regex namizəd tapilmadi"
    else:
        reason = "Plate text could not be recognized."

    return {
        "status": "accepted" if not manual_review_required else "manual_review",
        "manualReviewRequired": manual_review_required,
        "reason": reason,
        "plate": best_plate,
        "displayPlate": best_display_plate,
        "confidence": round(effective_confidence, 4),
        "text": ocr_result["text"],
        "bbox": detector_bbox,
        "source": f"yolo+{ocr_result.get('backend') or ocr_backend_order()[0]}" if detector_bbox else f"{ocr_result.get('backend') or ocr_backend_order()[0]}-review",
        "ocrBackend": ocr_result.get("backend") or ocr_backend_order()[0],
        "detectorConfidence": detector_confidence,
        "candidates": ocr_result["candidates"],
        "backendsTried": ocr_result.get("backendsTried", []),
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "vision"}


@app.post("/recognize")
def recognize(payload: RecognizeRequest):
    temp_path = None
    try:
        source_path = str(payload.imagePath or "").strip()
        if not source_path and payload.imageDataUrl:
            temp_path = save_image_data_url(payload.imageDataUrl)
            source_path = temp_path or ""

        if not source_path:
            raise HTTPException(status_code=400, detail="imagePath is required.")

        cv2, image = load_image(source_path)
        detector = legacy.detect_plate_region(source_path, image)
        crop = detector["crop"] if detector else image
        ocr_result = run_multi_pass_ocr(source_path, crop, cv2)
        return build_payload(source_path, detector or {}, ocr_result)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
    finally:
        if temp_path:
            try:
                Path(temp_path).unlink()
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
