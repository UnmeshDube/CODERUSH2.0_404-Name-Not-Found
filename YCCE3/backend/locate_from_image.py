"""Minimal image-to-location helper for JanSetu AI.

Endpoint:
    POST /api/locate-from-image
    POST /api/google/places/autocomplete
    POST /api/google/places/details
    POST /api/google/places/search
    POST /api/google/geocode/reverse

Wire the frontend to this service at http://127.0.0.1:8000.
The app uses:
    - LangChain chat wrapper
    - Qwen2.5-VL-7B-Instruct for vision extraction
    - JsonOutputParser for structured JSON output
    - Google Places Text Search / Places Autocomplete / Place Details / Geocoding
"""

from __future__ import annotations

import base64
import json
import logging
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, Body, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_core.output_parsers import JsonOutputParser
    from langchain_core.prompts import PromptTemplate
    from langchain_openai import ChatOpenAI
    LANGCHAIN_AVAILABLE = True
except ImportError:  # pragma: no cover - defensive for hackathon prototype environments
    HumanMessage = None
    SystemMessage = None
    JsonOutputParser = None
    PromptTemplate = None
    ChatOpenAI = None
    LANGCHAIN_AVAILABLE = False


logging.basicConfig(level=logging.DEBUG)
BASE_DIR = Path(__file__).resolve().parent.parent
BOUNDARY_FILE = BASE_DIR / "nagpur_boundary.geojson"
NAGPUR_BOUNDS = {
    "south": 21.02,
    "west": 78.95,
    "north": 21.25,
    "east": 79.2,
}
NAGPUR_LOCATION_BIAS = {
    "rectangle": {
        "low": {"latitude": NAGPUR_BOUNDS["south"], "longitude": NAGPUR_BOUNDS["west"]},
        "high": {"latitude": NAGPUR_BOUNDS["north"], "longitude": NAGPUR_BOUNDS["east"]},
    }
}


class LandmarkExtraction(BaseModel):
    signboard_text_primary: str = Field(description="The single largest/most prominent text on any sign, board, gate, or hoarding, transcribed verbatim, exactly as written, including any English transliteration if bilingual.")
    signboard_text_secondary: str = Field(description="Any secondary text on the same or a nearby sign — sub-heading, tagline, area name, established-year text, etc. Verbatim.")
    business_or_landmark_name: str = Field(description="Best-guess clean name of the business/landmark, e.g. 'Nagpur Stores' — derived from the signboard text, English-normalized, no extra punctuation.")
    locality_hint: str = Field(description="Any visible clue to neighborhood/area, e.g. 'Sadar Bazar', 'Civil Lines', printed on the sign, an address plate, a street sign, or a vehicle number plate's RTO code visible in frame.")
    landmark_category: str = Field(description="One of: shop, restaurant, government_building, religious_site, school_college, hospital, transit_stop, residential_gate, other")
    confidence: float = Field(description="0.0 to 1.0 — how confident the model is that signboard_text_primary was read correctly and completely.")
    ocr_notes: str = Field(description="Anything ambiguous, e.g. partially obscured text, multiple candidate readings, or reflections/glare affecting legibility.")


class LocationResult(BaseModel):
    formatted_address: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_id: str = ""
    matched_query: str = ""


class CandidateAttempt(BaseModel):
    candidate: str
    status: Literal["matched", "empty_result", "out_of_bounds", "error"]
    message: str = ""
    place_id: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class LocateResponse(BaseModel):
    location: LocationResult
    extracted_details: LandmarkExtraction
    found: bool
    extraction_status: str
    query_candidates: List[str] = []
    attempts: List[CandidateAttempt] = []
    raw_model_output: str = ""


class AutocompleteRequest(BaseModel):
    input: str


class PlaceDetailsRequest(BaseModel):
    place_id: str


class SearchRequest(BaseModel):
    textQuery: str


class ReverseGeocodeRequest(BaseModel):
    latitude: float
    longitude: float


app = FastAPI(title="JanSetu AI Location Helper")
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:8080,http://localhost:8080").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_boundary_geojson() -> Dict[str, Any]:
    if BOUNDARY_FILE.exists():
        return json.loads(BOUNDARY_FILE.read_text(encoding="utf-8"))
    return {
        "type": "Feature",
        "properties": {"name": "Nagpur fallback boundary"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [NAGPUR_BOUNDS["west"], NAGPUR_BOUNDS["south"]],
                [NAGPUR_BOUNDS["east"], NAGPUR_BOUNDS["south"]],
                [NAGPUR_BOUNDS["east"], NAGPUR_BOUNDS["north"]],
                [NAGPUR_BOUNDS["west"], NAGPUR_BOUNDS["north"]],
                [NAGPUR_BOUNDS["west"], NAGPUR_BOUNDS["south"]],
            ]],
        },
    }


def point_in_ring(lat: float, lng: float, ring: List[List[float]]) -> bool:
    inside = False
    x = lng
    y = lat
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        intersects = ((y1 > y) != (y2 > y)) and (
            x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1
        )
        if intersects:
            inside = not inside
    return inside


def boundary_contains(lat: float, lng: float, geojson: Dict[str, Any]) -> bool:
    geometry = geojson.get("geometry", geojson)
    if geometry.get("type") == "Polygon":
        return point_in_ring(lat, lng, geometry["coordinates"][0])
    if geometry.get("type") == "MultiPolygon":
        return any(point_in_ring(lat, lng, polygon[0]) for polygon in geometry["coordinates"])
    return NAGPUR_BOUNDS["south"] <= lat <= NAGPUR_BOUNDS["north"] and NAGPUR_BOUNDS["west"] <= lng <= NAGPUR_BOUNDS["east"]


def image_to_data_url(image_bytes: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def get_google_api_key() -> str:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")
    return api_key


def make_llm():
    if not LANGCHAIN_AVAILABLE or ChatOpenAI is None:
        return None
    return ChatOpenAI(
        model=os.getenv("QWEN_VL_MODEL", "Qwen2.5-VL-7B-Instruct"),
        api_key=os.getenv("QWEN_VL_API_KEY", "local-key"),
        base_url=os.getenv("QWEN_VL_BASE_URL"),
        temperature=0,
    )


def extract_details(image_bytes: bytes, mime_type: str) -> tuple[LandmarkExtraction, str, str]:
    if not LANGCHAIN_AVAILABLE or JsonOutputParser is None or PromptTemplate is None or HumanMessage is None or SystemMessage is None:
        logging.warning("LangChain packages are not installed; using empty fallback extraction.")
        return LandmarkExtraction(
            signboard_text_primary="",
            signboard_text_secondary="",
            business_or_landmark_name="",
            locality_hint="",
            landmark_category="other",
            confidence=0.0,
            ocr_notes="",
        ), "fallback_unavailable", ""

    parser = JsonOutputParser(pydantic_object=LandmarkExtraction)
    instructions = parser.get_format_instructions()
    prompt = PromptTemplate.from_template(
        "You will receive a single photo. Extract every visible sign or landmark text exactly as it appears, including non-English scripts. "
        "Return ONLY a JSON object with the required schema. Use empty strings for any fields that are unreadable or not present. "
        "Do not wrap the output in markdown. Do not add prose.\n\n{schema}"
    )

    messages = [
        SystemMessage(content="You are a vision extractor that reads signboards, storefronts, and landmark text from a photo."),
        HumanMessage(
            content=[
                {"type": "text", "text": prompt.format(schema=instructions)},
                {"type": "image_url", "image_url": {"url": image_to_data_url(image_bytes, mime_type)}},
            ]
        ),
    ]

    raw_output = ""
    try:
        llm = make_llm()
        if llm is None:
            raise RuntimeError("LLM backend unavailable")
        response = llm.invoke(messages)
        raw_output = response.content if hasattr(response, "content") else str(response)
        logging.debug("Raw Qwen extraction output: %s", raw_output)
        parsed = parser.parse(raw_output)
        extracted = LandmarkExtraction.model_validate(parsed)
        status = "ok"
        if extracted.confidence is not None and extracted.confidence < 0.25:
            status = "low_confidence"
        return extracted, status, raw_output
    except Exception as exc:
        logging.debug("Extraction parse failed: %s", exc, exc_info=True)
        return LandmarkExtraction(
            signboard_text_primary="",
            signboard_text_secondary="",
            business_or_landmark_name="",
            locality_hint="",
            landmark_category="other",
            confidence=0.0,
            ocr_notes="",
        ), "parse_error", raw_output


def build_query_candidates(extraction: LandmarkExtraction) -> List[str]:
    name = extraction.business_or_landmark_name.strip()
    locality = extraction.locality_hint.strip()
    primary = extraction.signboard_text_primary.strip()
    candidates: List[str] = []

    if name and locality:
        candidates.append(f"{name}, {locality}, Nagpur, Maharashtra")
    if name:
        candidates.append(f"{name}, Nagpur, Maharashtra")
    if primary and primary != name:
        candidates.append(f"{primary}, Nagpur, Maharashtra")
    if locality:
        candidates.append(f"{locality}, Nagpur, Maharashtra")

    if not candidates:
        fallback = ", ".join(
            part.strip()
            for part in [
                extraction.signboard_text_primary,
                extraction.signboard_text_secondary,
                extraction.business_or_landmark_name,
                extraction.locality_hint,
            ]
            if part.strip()
        )
        if fallback:
            candidates.append(fallback)

    seen: set[str] = set()
    ordered: List[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
    return ordered


def fetch_google_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    api_key = get_google_api_key()
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        content = response.read().decode("utf-8")
        return json.loads(content)


def google_places_text_search(query: str) -> Dict[str, Any]:
    payload = {
        "textQuery": query,
        "locationBias": NAGPUR_LOCATION_BIAS,
        "regionCode": "IN",
        "fieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types",
    }
    url = "https://places.googleapis.com/v1/places:searchText"
    result = fetch_google_json(url, payload)
    logging.debug("Google Places Text Search query=%s response=%s", query, result)
    return result


def google_geocode_address(query: str) -> Dict[str, Any]:
    api_key = get_google_api_key()
    params = urllib.parse.urlencode({
        "address": query,
        "key": api_key,
        "region": "in",
        "bounds": f"{NAGPUR_BOUNDS['south']},{NAGPUR_BOUNDS['west']}|{NAGPUR_BOUNDS['north']},{NAGPUR_BOUNDS['east']}",
    })
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"
    with urllib.request.urlopen(url, timeout=12) as response:
        content = response.read().decode("utf-8")
        result = json.loads(content)
        logging.debug("Google Geocode address=%s response=%s", query, result)
        return result


def google_place_details(place_id: str) -> Dict[str, Any]:
    payload = {
        "placeId": place_id,
        "fieldMask": "place.name,place.formattedAddress,place.location,place.types,place.addressComponents",
    }
    url = f"https://places.googleapis.com/v1/places/{urllib.parse.quote(place_id)}"
    result = fetch_google_json(url, payload)
    logging.debug("Google Place Details place_id=%s response=%s", place_id, result)
    return result


def google_reverse_geocode(lat: float, lng: float) -> Dict[str, Any]:
    api_key = get_google_api_key()
    params = urllib.parse.urlencode({
        "latlng": f"{lat},{lng}",
        "key": api_key,
        "region": "in",
    })
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"
    with urllib.request.urlopen(url, timeout=12) as response:
        content = response.read().decode("utf-8")
        result = json.loads(content)
        logging.debug("Google Reverse Geocode lat=%s lng=%s response=%s", lat, lng, result)
        return result


def parse_geocode_result(geojson: Dict[str, Any]) -> Optional[LocationResult]:
    results = geojson.get("results") or []
    if not results:
        return None
    first = results[0]
    location = None
    if first.get("geometry", {}).get("location"):
        loc = first["geometry"]["location"]
        location = LocationResult(
            formatted_address=first.get("formatted_address", ""),
            latitude=loc.get("lat"),
            longitude=loc.get("lng"),
            place_id=first.get("place_id", ""),
            matched_query="",
        )
    return location


def parse_place_search_result(search_json: Dict[str, Any]) -> Optional[LocationResult]:
    places = search_json.get("places") or []
    if not places:
        return None
    first = places[0]
    location = first.get("location") or {}
    return LocationResult(
        formatted_address=first.get("formattedAddress") or first.get("displayName", ""),
        latitude=location.get("latitude"),
        longitude=location.get("longitude"),
        place_id=first.get("id", ""),
        matched_query="",
    )


def try_search_candidates(candidates: List[str]) -> tuple[Optional[LocationResult], List[CandidateAttempt]]:
    attempts: List[CandidateAttempt] = []
    for candidate in candidates:
        try:
            search_json = google_places_text_search(candidate)
            location = parse_place_search_result(search_json)
            if not location:
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="empty_result",
                    message="No places found",
                ))
                continue

            if location.latitude is None or location.longitude is None:
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="error",
                    message="Place result missing location",
                    place_id=location.place_id,
                ))
                continue

            if not boundary_contains(location.latitude, location.longitude, load_boundary_geojson()):
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="out_of_bounds",
                    message="Result outside Nagpur boundary",
                    place_id=location.place_id,
                    latitude=location.latitude,
                    longitude=location.longitude,
                ))
                continue

            location.matched_query = candidate
            attempts.append(CandidateAttempt(
                candidate=candidate,
                status="matched",
                message="Matched inside Nagpur",
                place_id=location.place_id,
                latitude=location.latitude,
                longitude=location.longitude,
            ))
            return location, attempts
        except Exception as exc:
            logging.debug("Place search candidate failed: %s %s", candidate, exc, exc_info=True)
            attempts.append(CandidateAttempt(
                candidate=candidate,
                status="error",
                message=str(exc),
            ))

    # fallback to geocode for locality-style candidates
    for candidate in candidates:
        if ", Nagpur, Maharashtra" not in candidate:
            continue
        try:
            geocode_json = google_geocode_address(candidate)
            location = parse_geocode_result(geocode_json)
            if not location:
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="empty_result",
                    message="Geocode produced no results",
                ))
                continue
            if location.latitude is None or location.longitude is None:
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="error",
                    message="Geocode result missing location",
                ))
                continue
            if not boundary_contains(location.latitude, location.longitude, load_boundary_geojson()):
                attempts.append(CandidateAttempt(
                    candidate=candidate,
                    status="out_of_bounds",
                    message="Geocode result outside Nagpur boundary",
                ))
                continue
            location.matched_query = candidate
            attempts.append(CandidateAttempt(
                candidate=candidate,
                status="matched",
                message="Matched by geocode inside Nagpur",
            ))
            return location, attempts
        except Exception as exc:
            logging.debug("Geocode fallback failed: %s %s", candidate, exc, exc_info=True)
            attempts.append(CandidateAttempt(
                candidate=candidate,
                status="error",
                message=str(exc),
            ))

    return None, attempts


@app.post("/api/locate-from-image", response_model=LocateResponse)
async def locate_from_image(
    issue_photo: UploadFile = File(...),
    landmark_photo: UploadFile = File(...),
) -> LocateResponse:
    boundary = load_boundary_geojson()

    image_bytes = await landmark_photo.read()
    mime_type = landmark_photo.content_type or "image/jpeg"
    extracted, extraction_status, raw_output = extract_details(image_bytes, mime_type)
    query_candidates = build_query_candidates(extracted)
    location, attempts = try_search_candidates(query_candidates)

    if not location:
        return LocateResponse(
            location=LocationResult(),
            extracted_details=extracted,
            found=False,
            extraction_status=extraction_status,
            query_candidates=query_candidates,
            attempts=attempts,
            raw_model_output=raw_output,
        )

    return LocateResponse(
        location=LocationResult(
            formatted_address=location.formatted_address,
            latitude=location.latitude,
            longitude=location.longitude,
            place_id=location.place_id,
            matched_query=location.matched_query,
        ),
        extracted_details=extracted,
        found=True,
        extraction_status=extraction_status,
        query_candidates=query_candidates,
        attempts=attempts,
        raw_model_output=raw_output,
    )


@app.post("/api/google/places/autocomplete")
async def google_places_autocomplete(payload: AutocompleteRequest) -> Dict[str, Any]:
    if not payload.input.strip():
        return {"predictions": []}

    request_payload = {
        "input": payload.input.strip(),
        "locationRestriction": {
            "rectangle": {
                "low": {"latitude": NAGPUR_BOUNDS["south"], "longitude": NAGPUR_BOUNDS["west"]},
                "high": {"latitude": NAGPUR_BOUNDS["north"], "longitude": NAGPUR_BOUNDS["east"]},
            }
        },
        "regionCode": "IN",
    }
    url = "https://places.googleapis.com/v1/places:autocomplete"
    return fetch_google_json(url, request_payload)


@app.post("/api/google/places/details")
async def google_place_details_route(payload: PlaceDetailsRequest) -> Dict[str, Any]:
    return google_place_details(payload.place_id)


@app.post("/api/google/places/search")
async def google_places_search_route(payload: SearchRequest) -> Dict[str, Any]:
    if not payload.textQuery.strip():
        raise HTTPException(status_code=400, detail="textQuery is required")
    candidates = [payload.textQuery.strip()]
    location, attempts = try_search_candidates(candidates)
    return {
        "found": bool(location),
        "location": location.dict() if location else {},
        "attempts": [attempt.dict() for attempt in attempts],
    }


@app.post("/api/google/geocode/reverse")
async def google_reverse_geocode_route(payload: ReverseGeocodeRequest) -> Dict[str, Any]:
    geocode_json = google_reverse_geocode(payload.latitude, payload.longitude)
    location = parse_geocode_result(geocode_json)
    if not location:
        return {"formatted_address": "", "ward": ""}

    ward = ""
    for component in geocode_json.get("results", [])[0].get("address_components", []):
        types = component.get("types", [])
        if "sublocality_level_1" in types or "neighborhood" in types or "locality" in types:
            ward = component.get("long_name", "")
            break
    return {
        "formatted_address": location.formatted_address,
        "ward": ward,
        "place_id": location.place_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
