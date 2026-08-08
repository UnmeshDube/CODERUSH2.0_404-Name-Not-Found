"""
Serum-like client wrapper for STT and language-formatted transcription.

The pipeline is intentionally kept intact:
- Lazy-loads heavy dependencies (whisper/torch) only when needed.
- Falls back to `speech_recognition` Google STT if whisper isn't available.
- Uses `langdetect` only as a helper for mismatch warnings.
- Uses `googletrans` when available to reshape the transcript into the
  selected output language.

The public API returns the JSON shape requested by the voice-complaint flow.
"""

from __future__ import annotations

import importlib
import os
import tempfile
from typing import Optional

# Optional libraries (import lazily or guarded)
try:
    from langdetect import detect_langs

    _HAS_LANGDETECT = True
except Exception:
    detect_langs = None
    _HAS_LANGDETECT = False

try:
    from googletrans import Translator

    _HAS_GOOGLETRANS = True
    _translator = Translator()
except Exception:
    Translator = None
    _translator = None
    _HAS_GOOGLETRANS = False

try:
    import speech_recognition as sr

    _HAS_SR = True
except Exception:
    sr = None
    _HAS_SR = False

try:
    from pydub import AudioSegment

    _HAS_PYDUB = True
except Exception:
    AudioSegment = None
    _HAS_PYDUB = False


ALLOWED_SELECTED_LANGUAGES = {"English", "Hindi", "Hinglish", "Marathi"}

_CANONICAL_LANGUAGE_ALIASES = {
    "en": "English",
    "en-in": "English",
    "english": "English",
    "hi": "Hindi",
    "hi-in": "Hindi",
    "hindi": "Hindi",
    "hinglish": "Hinglish",
    "mr": "Marathi",
    "mr-in": "Marathi",
    "marathi": "Marathi",
}

_DEVANAGARI_TO_LATIN_CONSONANTS = {
    "\u0915": "k",
    "\u0916": "kh",
    "\u0917": "g",
    "\u0918": "gh",
    "\u0919": "ng",
    "\u091a": "ch",
    "\u091b": "chh",
    "\u091c": "j",
    "\u091d": "jh",
    "\u091e": "ny",
    "\u091f": "t",
    "\u0920": "th",
    "\u0921": "d",
    "\u0922": "dh",
    "\u0923": "n",
    "\u0924": "t",
    "\u0925": "th",
    "\u0926": "d",
    "\u0927": "dh",
    "\u0928": "n",
    "\u092a": "p",
    "\u092b": "ph",
    "\u092c": "b",
    "\u092d": "bh",
    "\u092e": "m",
    "\u092f": "y",
    "\u0930": "r",
    "\u0932": "l",
    "\u0935": "v",
    "\u0936": "sh",
    "\u0937": "sh",
    "\u0938": "s",
    "\u0939": "h",
}

_DEVANAGARI_TO_LATIN_VOWELS = {
    "\u0905": "a",
    "\u0906": "aa",
    "\u090d": "e",
    "\u0907": "i",
    "\u0908": "ii",
    "\u0909": "u",
    "\u090a": "uu",
    "\u090b": "ri",
    "\u0960": "rri",
    "\u0911": "o",
    "\u0912": "o",
    "\u090f": "e",
    "\u0910": "ai",
    "\u0913": "o",
    "\u0914": "au",
}

_DEVANAGARI_TO_LATIN_MATRAS = {
    "\u093e": "aa",
    "\u093f": "i",
    "\u0940": "ii",
    "\u0941": "u",
    "\u0942": "uu",
    "\u0943": "ri",
    "\u0944": "rri",
    "\u0947": "e",
    "\u0948": "ai",
    "\u094b": "o",
    "\u094c": "au",
    "\u0945": "e",
    "\u0949": "o",
}

_DEVANAGARI_SIGNS = {
    "\u0902": "n",
    "\u0901": "n",
    "\u0903": "h",
    "\u093d": "'",
}

_DEVANAGARI_SPECIALS = {
    "\u0915\u094d\u0937": "ksh",
    "\u0924\u094d\u0930": "tr",
    "\u091c\u094d\u091e": "gy",
    "\u0936\u094d\u0930": "shr",
}


def _transcribe_with_whisper(path: str) -> tuple[str, str, float]:
    """Lazily import whisper and transcribe the given audio path."""
    whisper = importlib.import_module("whisper")
    model = whisper.load_model("small")
    res = model.transcribe(path, language=None)
    text = res.get("text", "").strip()
    lang = res.get("language", "")
    return text, lang, 1.0


def _transcribe_with_speech_recognition(path: str) -> tuple[str, str, float]:
    if not _HAS_SR or sr is None:
        return "", "", 0.0
    r = sr.Recognizer()
    with sr.AudioFile(path) as source:
        audio = r.record(source)
    try:
        text = r.recognize_google(audio)
        return text, "en", 0.9
    except Exception:
        return "", "", 0.0


def _detect_language(text: str) -> tuple[str, float]:
    if not text:
        return "", 0.0
    if _HAS_LANGDETECT and detect_langs is not None:
        try:
            langs = detect_langs(text)
            if langs:
                best = langs[0]
                return best.lang, float(best.prob)
        except Exception:
            pass
    return "en", 0.5


def _contains_devanagari(text: str) -> bool:
    return any("\u0900" <= ch <= "\u097f" for ch in text)


def _normalize_selected_language(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    canonical = _CANONICAL_LANGUAGE_ALIASES.get(normalized.lower())
    if canonical in ALLOWED_SELECTED_LANGUAGES:
        return canonical
    if normalized in ALLOWED_SELECTED_LANGUAGES:
        return normalized
    return None


def _translate_text(text: str, dest: str, src: str = "auto") -> tuple[str, float]:
    if not text:
        return "", 0.0
    if dest == "en" and (src == "en" or src.startswith("en")):
        return text, 1.0
    if dest in {"hi", "mr"} and _contains_devanagari(text):
        return text, 1.0
    if dest == "hi" and src.startswith("hi"):
        return text, 1.0
    if dest == "mr" and src.startswith("mr"):
        return text, 1.0
    if _HAS_GOOGLETRANS and _translator is not None:
        try:
            res = _translator.translate(text, src=src or "auto", dest=dest)
            return getattr(res, "text", text), 0.8
        except Exception:
            pass
    return "", 0.0


def _ensure_wav(path: str) -> str:
    """Convert any audio file to 16kHz mono WAV using pydub + ffmpeg."""
    if path.lower().endswith(".wav"):
        return path
    if not _HAS_PYDUB or AudioSegment is None:
        raise RuntimeError(
            "pydub is required to convert non-WAV audio files. "
            "Install with: pip install pydub"
        )
    import subprocess
    # Verify ffmpeg is available
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        raise RuntimeError(
            "ffmpeg is required but not found on PATH. "
            "Install ffmpeg and make sure it is on your system PATH."
        )
    seg = AudioSegment.from_file(path)
    target = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
    seg = seg.set_frame_rate(16000).set_channels(1)
    seg.export(target, format="wav")
    return target


def _transliterate_devanagari_to_latin(text: str) -> str:
    if not text:
        return ""

    for source, replacement in _DEVANAGARI_SPECIALS.items():
        text = text.replace(source, replacement)

    output: list[str] = []
    pending_consonant = ""
    suppress_inherent_vowel = False

    def flush_pending(add_inherent_vowel: bool = True) -> None:
        nonlocal pending_consonant, suppress_inherent_vowel
        if not pending_consonant:
            suppress_inherent_vowel = False
            return
        output.append(pending_consonant)
        if add_inherent_vowel and not suppress_inherent_vowel:
            output.append("a")
        pending_consonant = ""
        suppress_inherent_vowel = False

    for ch in text:
        if ch in _DEVANAGARI_TO_LATIN_VOWELS:
            flush_pending(True)
            output.append(_DEVANAGARI_TO_LATIN_VOWELS[ch])
            continue

        if ch in _DEVANAGARI_TO_LATIN_CONSONANTS:
            flush_pending(True)
            pending_consonant = _DEVANAGARI_TO_LATIN_CONSONANTS[ch]
            continue

        if ch == "\u094d":
            if pending_consonant:
                flush_pending(False)
                suppress_inherent_vowel = True
            continue

        if ch in _DEVANAGARI_TO_LATIN_MATRAS:
            if pending_consonant:
                output.append(pending_consonant)
                pending_consonant = ""
            output.append(_DEVANAGARI_TO_LATIN_MATRAS[ch])
            suppress_inherent_vowel = False
            continue

        if ch in _DEVANAGARI_SIGNS:
            flush_pending(True)
            output.append(_DEVANAGARI_SIGNS[ch])
            continue

        if ch.isspace():
            flush_pending(True)
            output.append(ch)
            continue

        if ch.isascii():
            flush_pending(True)
            output.append(ch)
            continue

        if "\u0900" <= ch <= "\u097f":
            flush_pending(True)
            continue

        flush_pending(True)
        output.append(ch)

    flush_pending(True)
    return "".join(output).replace("  ", " ").strip()


def _map_confidence_label(score: float, mismatch_warning: bool) -> str:
    if mismatch_warning:
        return "Low"
    if score >= 0.9:
        return "High"
    if score >= 0.6:
        return "Medium"
    return "Low"


def _build_transcript(original_text: str, selected_language: str) -> tuple[str, bool, float]:
    if not original_text:
        return "", False, 0.0

    detected_lang, detect_conf = _detect_language(original_text)
    contains_devanagari = _contains_devanagari(original_text)
    mismatch_warning = False
    transcript = original_text.strip()
    confidence_score = 0.75

    if selected_language == "English":
        if contains_devanagari or not detected_lang.startswith("en"):
            translated, trans_conf = _translate_text(original_text, "en", src="auto")
            if translated:
                transcript = translated.strip()
                confidence_score = min(1.0, max(trans_conf, detect_conf, 0.8))
            mismatch_warning = contains_devanagari or not detected_lang.startswith("en")
        else:
            transcript = original_text.strip()
            confidence_score = max(detect_conf, 0.85)

    elif selected_language == "Hindi":
        if not contains_devanagari:
            translated, trans_conf = _translate_text(original_text, "hi", src="auto")
            if translated:
                transcript = translated.strip()
                confidence_score = min(1.0, max(trans_conf, detect_conf, 0.75))
            mismatch_warning = True
            if not transcript:
                transcript = original_text.strip()
        else:
            transcript = original_text.strip()
            confidence_score = max(detect_conf, 0.75)

    elif selected_language == "Marathi":
        if not contains_devanagari:
            translated, trans_conf = _translate_text(original_text, "mr", src="auto")
            if translated:
                transcript = translated.strip()
                confidence_score = min(1.0, max(trans_conf, detect_conf, 0.75))
            mismatch_warning = True
            if not transcript:
                transcript = original_text.strip()
        else:
            transcript = original_text.strip()
            confidence_score = max(detect_conf, 0.75)

    elif selected_language == "Hinglish":
        if contains_devanagari:
            transcript = _transliterate_devanagari_to_latin(original_text)
            confidence_score = max(detect_conf, 0.7)
            mismatch_warning = True
        else:
            transcript = original_text.strip()
            confidence_score = max(detect_conf, 0.8)

    else:
        return original_text.strip(), True, 0.0

    if selected_language in {"Hindi", "Marathi"} and not transcript:
        translated, trans_conf = _translate_text(
            original_text,
            "hi" if selected_language == "Hindi" else "mr",
            src="auto",
        )
        transcript = translated.strip() if translated else original_text.strip()
        confidence_score = max(confidence_score, trans_conf)

    if selected_language == "Hinglish" and not transcript:
        transcript = _transliterate_devanagari_to_latin(original_text) if contains_devanagari else original_text.strip()

    return transcript, mismatch_warning, confidence_score


def _finalize_result(selected_language: str, transcript: str, mismatch_warning: bool, confidence_score: float) -> dict:
    result = {
        "selected_language": selected_language,
        "transcript": transcript,
        "confidence": _map_confidence_label(confidence_score, mismatch_warning),
    }
    if mismatch_warning:
        result["mismatch_warning"] = True
    return result


def process_audio_file(
    path: str,
    selected_language: Optional[str] = None,
    hint_language: Optional[str] = None,
) -> dict:
    """Process an audio file and return the requested JSON shape."""
    canonical_language = _normalize_selected_language(selected_language) or _normalize_selected_language(hint_language)
    if canonical_language not in ALLOWED_SELECTED_LANGUAGES:
        return {
            "selected_language": selected_language or hint_language or "",
            "transcript": "",
            "confidence": "Low",
            "error": "Invalid selected_language. Choose one of: English, Hindi, Hinglish, Marathi",
        }

    wav = path
    temp_created = False
    try:
        try:
            wav = _ensure_wav(path)
            temp_created = wav != path
        except Exception as conv_err:
            print(f"[serum_client] WAV conversion failed: {conv_err}")
            return {
                "selected_language": canonical_language,
                "transcript": "",
                "confidence": "Low",
                "error": f"Audio conversion failed: {conv_err}",
            }

        original_text = ""
        detected_lang_from_stt = ""
        stt_conf = 0.0
        try:
            original_text, detected_lang_from_stt, stt_conf = _transcribe_with_whisper(wav)
        except Exception as whisper_err:
            print(f"[serum_client] Whisper not available ({whisper_err}), falling back to SpeechRecognition")
            original_text, detected_lang_from_stt, stt_conf = _transcribe_with_speech_recognition(wav)

        if not original_text.strip():
            return {
                "selected_language": canonical_language,
                "transcript": "",
                "confidence": "Low",
                "error": "No clear speech detected",
            }

        transcript, mismatch_warning, confidence_score = _build_transcript(original_text, canonical_language)
        if not transcript.strip():
            return {
                "selected_language": canonical_language,
                "transcript": "",
                "confidence": "Low",
                "error": "No clear speech detected",
            }

        if canonical_language == "Hinglish" and detected_lang_from_stt.startswith(("hi", "mr")):
            mismatch_warning = True
        if canonical_language == "English" and detected_lang_from_stt and not detected_lang_from_stt.startswith("en"):
            mismatch_warning = True
        if canonical_language in {"Hindi", "Marathi"} and detected_lang_from_stt and detected_lang_from_stt.startswith("en"):
            mismatch_warning = True

        if mismatch_warning:
            confidence_score = min(confidence_score, 0.45)
        elif stt_conf:
            confidence_score = max(confidence_score, stt_conf)

        return _finalize_result(canonical_language, transcript, mismatch_warning, confidence_score)
    finally:
        if temp_created and os.path.exists(wav):
            try:
                os.remove(wav)
            except Exception:
                pass
