import os
import json
from pathlib import Path

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_core.prompts import PromptTemplate
    from langchain_core.output_parsers import JsonOutputParser
    from langchain_openai import ChatOpenAI
    from pydantic import BaseModel, Field
except ImportError:
    pass # Needs langchain-openai and pydantic

BASE_DIR = Path(__file__).resolve().parent

class LocationDetails(BaseModel):
    lat: float = Field(description="Latitude")
    lng: float = Field(description="Longitude")
    address: str = Field(description="Formatted address")

class ComplaintAnalysis(BaseModel):
    heading: str = Field(description="A short, concise title for the issue")
    category: str = Field(description="The most relevant category based on Chicago 311 dataset")
    description: str = Field(description="A detailed description based on the transcript")
    location: LocationDetails = Field(description="Location details")

def load_categories():
    try:
        cat_file = BASE_DIR / "YCCE3" / "categories.json"
        if cat_file.exists():
            cats = json.loads(cat_file.read_text(encoding="utf-8"))
            return ", ".join([c.get("title", "") for c in cats])
    except Exception as e:
        print(f"Error loading categories: {e}")
    return "Abandoned Vehicles, Garbage Carts, Graffiti Removal, Potholes & Road Damage, Street Light All Out, Street Light One Out, Sanitation Code Complaints, Tree Debris"

def analyze_complaint_with_langchain(transcript: str, lat: float, lng: float, address: str):
    # Determine the model endpoint
    api_key = os.getenv("QWEN_API_KEY", "local-key")
    base_url = os.getenv("QWEN_BASE_URL", "http://localhost:11434/v1") # Default to local ollama for Qwen
    model_name = os.getenv("QWEN_MODEL_NAME", "qwen2.5:0.5b")

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.1
    )

    parser = JsonOutputParser(pydantic_object=ComplaintAnalysis)
    categories_str = load_categories()

    system_prompt = f"""You are a civic issue categorizer based on the Chicago 311 dataset.
Available categories: {categories_str}
Your job is to read the user's voice transcript and categorize their complaint.
You must return a valid JSON object matching the requested schema. Do not include markdown formatting or extra text."""

    user_prompt = f"""
Transcript: {transcript}
Latitude: {lat}
Longitude: {lng}
Address: {address}

{parser.get_format_instructions()}
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt)
    ]

    try:
        response = llm.invoke(messages)
        parsed = parser.parse(response.content)
        return parsed
    except Exception as e:
        print(f"Langchain analysis error: {e}")
        # Fallback output
        return {
            "heading": "Civic Issue Reported",
            "category": "General",
            "description": transcript if transcript else "No description provided.",
            "location": {
                "lat": lat or 0.0,
                "lng": lng or 0.0,
                "address": address or ""
            }
        }

if __name__ == "__main__":
    # Test
    res = analyze_complaint_with_langchain("There is a massive pothole in front of my house", 21.1, 79.1, "Nagpur")
    print(res)
